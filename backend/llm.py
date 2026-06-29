"""
对话生成 —— 全程由 DeepSeek 驱动，"先反复思量，再开口"。

为了让对话立体、贴近真人，每一轮分两步真正地推理（两次模型调用）：

  ① 盘算（deliberate）：角色只在心里想——别人刚说的话各是什么用意、触动了我的
     什么心事/恩怨/渴望、我此刻真实的情绪、我想达到又顾忌什么、可以怎么回应、各有
     什么后果、我倾向哪一种。产出一段允许纠结与潜台词的内心独白。

  ② 发言（speak）：基于①的盘算，说出真正出口的话，并判断这次互动让我对说话者
     的好感如何变化。

人格锚点（核心身份/价值观）、可选【世界观】、以及"好感·熟悉·信任"的完整关系，
每一轮都重注入，对抗长期漂移。盘算阶段可用「深度思考」开关关闭以加速。

无 Key 或调用失败都会抛出可读错误（LLMError），绝不静默伪造内容。
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Optional

from . import database as db

DEFAULT_MODEL = "deepseek-v4-flash"


@dataclass
class Context:
    agent: dict
    recent: list[dict] = field(default_factory=list)
    memories: list[str] = field(default_factory=list)
    relationships: dict = field(default_factory=dict)
    topic: Optional[str] = None


class LLMError(Exception):
    """大模型调用相关的可读错误，会被上层转成 400 返回给前端。"""


# ===================================================================
#  上下文 -> 人格块
# ===================================================================

def _rel_state(r: dict) -> str:
    aff = r.get("affinity", 0)
    mood = "亲近" if aff > 30 else "敌对" if aff < -30 else "中立"
    fam = r.get("familiarity", 0); tr = r.get("trust", 0)
    fam_w = "很熟" if fam > 60 else "认识" if fam > 25 else "不太熟"
    tr_w = "信任" if tr > 60 else "将信将疑" if tr > 30 else "不信任"
    return f"好感{aff:+.0f}({mood})·{fam_w}({fam:.0f})·{tr_w}({tr:.0f})"


def _persona_block(ctx: Context, anchor_enabled: bool) -> str:
    """角色的全部设定 + 当前处境（不含"怎么发言"的格式指令）。"""
    a = ctx.agent
    L = []
    worldview = (db.get_meta("worldview") or "").strip()
    if worldview:
        L.append(f"【世界观｜所有人共处的背景】\n{worldview}\n")
    L.append(f"你就是 {a['name']}，不是在扮演，而是这个人本身。你有自己的来历、心事与立场。")
    if anchor_enabled:
        if a.get("identity"):
            L.append(f"【核心身份｜不可动摇】{a['identity']}")
        if a.get("values_anchor"):
            L.append(f"【价值观与内核｜不可动摇】{a['values_anchor']}")
    if a.get("background"):
        L.append(f"【你的来历与处境】{a['background']}")
    if a.get("speaking_style"):
        L.append(f"【说话风格】{a['speaking_style']}")
    traits = a.get("traits", {})
    if traits:
        zh = {"curiosity": "好奇", "assertiveness": "果断", "warmth": "温暖",
              "skepticism": "怀疑", "humor": "幽默", "emotional": "情绪化"}
        desc = "，".join(f"{zh.get(k,k)}{v:.1f}" for k, v in traits.items())
        L.append(f"【人格特质 0-1】{desc}（越高越突出，应自然渗进言行）")
    if ctx.relationships:
        rel = "；".join(
            f"{nm}（{r['label']}）：{_rel_state(r)}" if r.get("label")
            else f"{nm}：{_rel_state(r)}"
            for nm, r in ctx.relationships.items())
        L.append(f"【你眼中在场的人】{rel}")
    if ctx.memories:
        L.append("【你记得的相关往事】\n- " + "\n- ".join(ctx.memories))
    if ctx.topic:
        L.append(f"【当前的话题 / 正在发生的事】{ctx.topic}")
    return "\n".join(L)


def _format_messages(ctx: Context) -> list[dict]:
    msgs = []
    for m in ctx.recent:
        msgs.append({"role": "user", "content": f"{m['name']}：{m['content']}"})
    if not msgs:
        msgs.append({"role": "user", "content": "（场面刚起，还没有人开口。请你自然地起个头。）"})
    return msgs


_DELIBERATE_GUIDE = (
    "\n\n# 现在，只在心里想，先不要说话\n"
    "结合你的性格、来历、记得的事，以及你与在场每个人的好感/熟悉/信任和此刻的处境，认真盘算：\n"
    "1) 他们刚才说的话，各自是什么用意？我怎么看？\n"
    "2) 这触动了我的什么——我的心事、恩怨、渴望，还是恐惧？\n"
    "3) 我此刻真实的情绪是什么？我想达到什么、又顾忌什么？\n"
    "4) 我可以怎么回应，各会带来什么后果，我更想选哪一种？\n"
    "把这段内心盘算如实写出来：第一人称，4-6 句，可以纠结、迟疑、口是心非、带潜台词。"
    "只输出这段心理活动本身，不要说出口的话、不要任何格式标记。"
)

_SPEAK_GUIDE = (
    "\n\n# 现在，说出你真正要说的话\n"
    "紧扣别人刚说的内容和你方才的盘算去回应——可以认同、反驳、试探、敷衍、挑衅、岔开或欲言又止，"
    "像真人一样有立场、有情绪、有潜台词，藏住你不想让人知道的事。1-3 句，口语、自然，贴合你的说话风格；"
    "不要旁白、不要括号动作、不要复述设定。\n"
    "再判断：这次互动后，你对【上一位说话者】的好感是否改变，给 -5 到 5 的整数 delta"
    "（正=更亲近/信任，负=更反感/失望，0=没变）和简短 reason；没有就给空数组。\n"
    "只输出一个 JSON，不要任何额外文字或代码块：\n"
    '{"reply": "...", "mood": "此刻心情(2-6字)", "toward": [{"name": "对方名字", "delta": 0, "reason": "..."}]}'
)

_SINGLE_GUIDE = (
    "\n\n# 怎么发言\n"
    "先在心里推理（他们说了什么、我怎么看、结合我的性格/记忆/关系，我什么情绪、想怎样），"
    "再说出真正回应上下文的话，像真人一样有立场有情绪有潜台词。只输出一个 JSON：\n"
    '{"thinking": "我的内心盘算(2-4句)", "reply": "说出口的话(1-3句)", "mood": "心情(2-6字)", '
    '"toward": [{"name": "上一位说话者", "delta": 介于-5到5, "reason": "..."}]}'
)


# ===================================================================
#  底层调用（OpenAI 兼容）
# ===================================================================

def _chat(messages: list[dict], api_key: str, model: str, base_url: str,
          max_tokens: int, temperature: float) -> str:
    import httpx
    resp = httpx.post(
        base_url.rstrip("/") + "/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "content-type": "application/json"},
        json={"model": model, "max_tokens": max_tokens, "temperature": temperature,
              "messages": messages},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    return (data["choices"][0]["message"]["content"] or "").strip()


def _base_url() -> str:
    return os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")


# 兼容旧测试：单次"先想后说"调用
def openai_compatible_respond(ctx: Context, api_key: str, model: str, base_url: str) -> str:
    system = _persona_block(ctx, db.anchor_enabled()) + _SINGLE_GUIDE
    messages = [{"role": "system", "content": system}] + _format_messages(ctx)
    return _chat(messages, api_key, model, base_url, 800, 1.0)


def deepseek_respond(ctx: Context, api_key: str, model: str) -> str:
    return openai_compatible_respond(ctx, api_key, model, _base_url())


# ===================================================================
#  两阶段：盘算 -> 发言
# ===================================================================

def _deliberate(ctx: Context, api_key: str, model: str, base: str) -> str:
    system = _persona_block(ctx, db.anchor_enabled()) + _DELIBERATE_GUIDE
    messages = [{"role": "system", "content": system}] + _format_messages(ctx)
    return _chat(messages, api_key, model, base, 600, 0.9)


def _speak(ctx: Context, api_key: str, model: str, base: str, thinking: str) -> dict:
    system = _persona_block(ctx, db.anchor_enabled())
    if thinking:
        system += f"\n\n# 你刚才在心里这样盘算\n「{thinking}」"
    system += _SPEAK_GUIDE
    messages = [{"role": "system", "content": system}] + _format_messages(ctx)
    raw = _chat(messages, api_key, model, base, 400, 1.0)
    return _parse(raw)


# ===================================================================
#  解析模型的结构化输出
# ===================================================================

def _extract_json(raw: str) -> Optional[dict]:
    s = raw.strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    try:
        return json.loads(s)
    except Exception:
        pass
    i, j = s.find("{"), s.rfind("}")
    if i != -1 and j != -1 and j > i:
        try:
            return json.loads(s[i:j + 1])
        except Exception:
            return None
    return None


def _parse(raw: str) -> dict:
    obj = _extract_json(raw)
    if not isinstance(obj, dict):
        return {"reply": raw.strip()[:300] or "……", "thinking": "", "mood": "", "toward": []}
    reply = str(obj.get("reply") or "").strip() or "……"
    thinking = str(obj.get("thinking") or "").strip()
    mood = str(obj.get("mood") or "").strip()[:12]
    toward = obj.get("toward")
    clean = []
    if isinstance(toward, list):
        for t in toward:
            if not isinstance(t, dict):
                continue
            try:
                delta = max(-5, min(5, float(t.get("delta", 0))))
            except Exception:
                delta = 0
            clean.append({"name": str(t.get("name") or "").strip(),
                          "delta": delta, "reason": str(t.get("reason") or "").strip()})
    return {"reply": reply, "thinking": thinking, "mood": mood, "toward": clean}


# ===================================================================
#  统一入口
# ===================================================================

def deliberate_enabled() -> bool:
    return (db.get_meta("deliberate") or "1") == "1"


def respond(ctx: Context) -> dict:
    """每一句发言都由 DeepSeek 生成。默认两阶段（先盘算后发言）以求立体；
    可关「深度思考」退回单次。无 Key 或失败抛出可读错误，绝不静默回退。"""
    key = db.get_meta("deepseek_key") or os.getenv("DEEPSEEK_API_KEY", "")
    model = db.get_meta("deepseek_model") or DEFAULT_MODEL
    base = _base_url()
    if not key:
        raise LLMError("尚未配置 DeepSeek API Key。请点右上角「⚙ 引擎」填入 Key（在 platform.deepseek.com 获取）。")
    try:
        if deliberate_enabled():
            thinking = _deliberate(ctx, key, model, base)
            res = _speak(ctx, key, model, base, thinking)
            if thinking:
                res["thinking"] = thinking          # 用更深的盘算覆盖
            return res
        # 单次模式
        raw = _chat([{"role": "system", "content": _persona_block(ctx, db.anchor_enabled()) + _SINGLE_GUIDE}]
                    + _format_messages(ctx), key, model, base, 800, 1.0)
        return _parse(raw)
    except LLMError:
        raise
    except Exception as e:  # noqa: BLE001
        raise LLMError(f"DeepSeek 调用失败：{_explain(e)}") from e


def _explain(e: Exception) -> str:
    import httpx
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code
        return {
            401: "Key 无效或未授权", 402: "余额不足", 429: "请求过于频繁/限流",
            500: "服务端错误", 503: "服务暂时不可用",
        }.get(code, f"HTTP {code}")
    if isinstance(e, httpx.TimeoutException):
        return "请求超时（深度思考较慢，可在引擎里关掉「深度思考」或重试）"
    if isinstance(e, httpx.ConnectError):
        return "无法连接到 DeepSeek（检查网络/代理）"
    return str(e) or e.__class__.__name__
