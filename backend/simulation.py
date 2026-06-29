"""
模拟引擎：单步推进 AI 社会。

一次 step 的流程：
  选出下一位发言者 → 为它构造上下文（人格锚点 + 近期对话 + 检索到的长期记忆 + 当前关系）
  → 生成发言 → 落库 → 在场所有人形成对该事件的（主观）记忆 → 关系演变
  → 周期性触发：记忆巩固、反思、人格一致性打点。
"""

from __future__ import annotations

import json
import random

from . import database as db
from . import llm, memory, personality, relationships
from .llm import Context

RECENT_WINDOW = 8       # 喂给模型的近期对话条数
CONSISTENCY_WINDOW = 5  # 一致性度量取该 agent 最近几条发言


def _load_agents() -> list[dict]:
    rows = db.query("SELECT * FROM agents ORDER BY created_at ASC")
    out = []
    for r in rows:
        a = dict(r)
        a["traits"] = json.loads(a["traits"] or "{}")
        out.append(a)
    return out


def _recent_messages(limit: int) -> list[dict]:
    rows = db.query(
        "SELECT m.content, m.agent_id, a.name FROM messages m "
        "JOIN agents a ON a.id=m.agent_id ORDER BY m.id DESC LIMIT ?",
        (limit,),
    )
    msgs = [{"name": r["name"], "content": r["content"], "agent_id": r["agent_id"]}
            for r in rows]
    msgs.reverse()
    return msgs


def _pick_speaker(agents: list[dict], last_speaker_id: str | None) -> dict:
    candidates = [a for a in agents if a["id"] != last_speaker_id] or agents
    weights = []
    for a in candidates:
        w = 1.0 + a["traits"].get("assertiveness", 0.5)   # 果断者更爱开口
        if last_speaker_id:
            rel = relationships.get(a["id"], last_speaker_id)
            if rel:
                # 对上一位有强烈情绪（爱或恨）者更可能回应
                w += abs(rel["affinity"]) / 100.0 + rel["familiarity"] / 200.0
        weights.append(w)
    return random.choices(candidates, weights=weights, k=1)[0]


def get_topic() -> str | None:
    t = db.get_meta("topic")
    return t if t else None


def set_topic(topic: str) -> None:
    db.set_meta("topic", topic or "")


def step() -> dict:
    """推进一轮，返回新产生的发言。"""
    agents = _load_agents()
    if len(agents) < 2:
        raise ValueError("至少需要两个 AI 才能开始对话。")

    name_lookup = {a["id"]: a["name"] for a in agents}
    recent = _recent_messages(RECENT_WINDOW)
    last_speaker_id = recent[-1]["agent_id"] if recent else None
    last_speaker = next((a for a in agents if a["id"] == last_speaker_id), None)

    speaker = _pick_speaker(agents, last_speaker_id)
    topic = get_topic()

    # 检索发言者的长期记忆：以近期对话 + 话题作为查询
    query = " ".join(m["content"] for m in recent[-2:]) + " " + (topic or "")
    mems = memory.retrieve(speaker["id"], query.strip() or speaker["name"], k=4)
    mem_texts = [m["content"] for m in mems]

    ctx = Context(
        agent=speaker,
        recent=[{"name": m["name"], "content": m["content"]} for m in recent],
        memories=mem_texts,
        relationships=relationships.for_agent(speaker["id"], name_lookup),
        topic=topic,
    )

    res = llm.respond(ctx)
    text = (res.get("reply") or "……").strip() or "……"
    thinking = res.get("thinking", "")
    mood = res.get("mood", "")
    toward = res.get("toward", []) or []

    # 大模型成功返回后才推进轮次并落库，避免失败时轮次空跳
    db.bump_turn()

    # 落库发言（含内心活动）
    msg_id = db.execute(
        "INSERT INTO messages(agent_id,content,thinking,mood,turn,created_at) VALUES(?,?,?,?,?,?)",
        (speaker["id"], text, thinking, mood, db.get_turn(), db.now()),
    )

    agent_names = [a["name"] for a in agents]
    present_ids = [a["id"] for a in agents]

    # 内心活动进入长期记忆：让角色记得自己的盘算，形成连续的心理脉络
    if thinking:
        memory.add_memory(speaker["id"], f"（我当时心里想）{thinking}",
                          kind="reflection", importance=5.5, agent_names=agent_names)

    # 社会化记忆：发言者第一人称记下；其余在场者以第三人称记下（重要的才记，控量）
    speaker_mem = f"我说：{text}"
    if last_speaker and last_speaker["id"] != speaker["id"]:
        speaker_mem = f"（回应{last_speaker['name']}）我说：{text}"
    memory.add_memory(speaker["id"], speaker_mem, kind="episodic", agent_names=agent_names)

    third = f"{speaker['name']}说：{text}"
    imp = memory.score_importance(third, agent_names)
    for a in agents:
        if a["id"] == speaker["id"]:
            continue
        if imp >= 5.0:   # 只记得住相对重要的旁听内容，避免记忆爆炸
            memory.add_memory(a["id"], third, kind="episodic",
                              importance=imp - 0.5, agent_names=agent_names)

    # 关系演变：优先用模型对【上一位发言者】的好感判断来驱动
    model_delta = None
    delta_reason = ""
    if last_speaker and toward:
        for t in toward:
            if t.get("name") and t["name"] == last_speaker["name"]:
                model_delta = t.get("delta")
                delta_reason = t.get("reason", "")
                break
    relationships.update_after_interaction(speaker, last_speaker, text, present_ids,
                                           model_delta=model_delta)

    # 把"为什么更亲近/更疏远"也记进记忆，让关系变化有迹可循
    if last_speaker and model_delta and abs(model_delta) >= 2 and delta_reason:
        verb = "更亲近了" if model_delta > 0 else "更疏远了"
        memory.add_memory(speaker["id"], f"我对{last_speaker['name']}{verb}：{delta_reason}",
                          kind="episodic", importance=6.0, agent_names=agent_names)

    # 周期性维护：巩固、反思、一致性打点
    for a in agents:
        memory.consolidate(a["id"])
    memory.reflect(speaker["id"], speaker["name"])

    # 人格一致性：取该发言者最近若干条发言度量
    own_rows = db.query(
        "SELECT content FROM messages WHERE agent_id=? ORDER BY id DESC LIMIT ?",
        (speaker["id"], CONSISTENCY_WINDOW),
    )
    own_texts = [r["content"] for r in own_rows]
    cons = personality.measure_consistency(speaker, own_texts)
    if cons is not None:
        personality.record_snapshot(speaker["id"], cons)

    return {
        "id": msg_id,
        "agent_id": speaker["id"],
        "name": speaker["name"],
        "color": speaker["color"],
        "content": text,
        "thinking": thinking,
        "mood": mood,
        "turn": db.get_turn(),
    }


def run_many(n: int) -> list[dict]:
    """快进 n 轮，用于快速检验长期稳定性。返回最后产生的若干条发言。

    若中途大模型调用失败（如限流），已生成的部分照常保留并返回；
    若一条都没生成（通常是未配置 Key），则抛出错误供前端提示。
    """
    out = []
    for _ in range(max(1, min(n, 500))):
        try:
            out.append(step())
        except llm.LLMError:
            if out:
                break
            raise
    return out[-12:]
