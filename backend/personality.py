"""
人格稳定性系统（核心模块之一）。

长期运行下让 AI 不"走样"的两道防线：

1) 人格锚点（anchor）：核心身份 + 价值观 + 特质，在【每一轮】发言前重新注入到
   提示词最前端（见 llm._format_system）。这是对抗长程上下文稀释导致人格漂移的主手段。
   后台可一键关闭锚点，用来对照观察"无锚点时人格如何缓慢漂移"。

2) 一致性度量：把每条发言中"表达出来的特质"向量化，与该 agent 的【核心特质】向量
   做余弦相似度。持续落盘成快照 → 形成"人格稳定性"曲线。锚点开启时曲线应稳定在高位，
   关闭时应逐渐下滑、抖动——直观证明锚点的作用。

度量逻辑对 mock 与真实大模型生成的文本同样适用（基于词法信号，透明可复现）。
"""

from __future__ import annotations

import math

from . import database as db

# 六个特质维度对应的关键词（中英），用于从任意文本中识别"表达出的特质"
TRAIT_KEYWORDS = {
    "curiosity":     ["好奇", "角度", "更多", "为什么", "了解", "探索", "想想", "问题",
                       "curious", "wonder", "why", "explore"],
    "assertiveness": ["立场", "坚持", "必须", "该", "决定", "主意", "明确", "拿主意",
                       "assert", "must", "should", "decide"],
    "warmth":        ["一起", "温暖", "懂", "支持", "我们", "关心", "陪", "在",
                       "together", "warm", "support", "care"],
    "skepticism":    ["怀疑", "证据", "警惕", "未必", "反驳", "保留", "另一面", "相信",
                       "doubt", "evidence", "suspect"],
    "humor":         ["笑", "赌", "离谱", "较真", "玩笑", "哈", "好玩",
                       "joke", "laugh", "bet", "fun"],
    "emotional":     ["心里", "感慨", "难忘", "情绪", "感动", "重量", "感受", "动",
                       "feel", "emotion", "moved"],
}

TRAIT_DIMS = list(TRAIT_KEYWORDS.keys())


def expressed_vector(text: str) -> list[float]:
    """从一段文本里数出各特质关键词的命中次数，得到"表达特质"向量。"""
    low = text.lower()
    return [sum(low.count(kw.lower()) for kw in TRAIT_KEYWORDS[d]) for d in TRAIT_DIMS]


def core_vector(agent: dict) -> list[float]:
    traits = agent.get("traits", {})
    return [float(traits.get(d, 0.5)) for d in TRAIT_DIMS]


def _cosine(a: list[float], b: list[float]) -> float:
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return sum(x * y for x, y in zip(a, b)) / (na * nb)


def measure_consistency(agent: dict, recent_texts: list[str]) -> float | None:
    """
    近期发言与核心人格的吻合度（0..1）。
    只统计"带有特质信号"的发言；若近期完全无信号则返回 None（不打点）。
    """
    core = core_vector(agent)
    sims = []
    for t in recent_texts:
        ev = expressed_vector(t)
        if sum(ev) == 0:
            continue
        sims.append(_cosine(ev, core))
    if not sims:
        return None
    return round(sum(sims) / len(sims), 4)


def record_snapshot(agent_id: str, consistency: float) -> None:
    db.execute(
        "INSERT INTO personality_snapshots(agent_id,consistency,turn,created_at) "
        "VALUES(?,?,?,?)",
        (agent_id, consistency, db.get_turn(), db.now()),
    )


def history(agent_id: str) -> list[dict]:
    rows = db.query(
        "SELECT consistency,turn,created_at FROM personality_snapshots "
        "WHERE agent_id=? ORDER BY turn ASC",
        (agent_id,),
    )
    return [dict(r) for r in rows]


def persona_summary(agent: dict) -> str:
    """给前端展示用的一句话人设摘要。"""
    parts = []
    if agent.get("identity"):
        parts.append(agent["identity"])
    traits = agent.get("traits", {})
    if traits:
        top = sorted(traits.items(), key=lambda x: x[1], reverse=True)[:2]
        labels = {
            "curiosity": "好奇", "assertiveness": "果断", "warmth": "温暖",
            "skepticism": "审慎", "humor": "诙谐", "emotional": "感性",
        }
        parts.append("、".join(labels.get(k, k) for k, _ in top))
    return " · ".join(parts) if parts else agent.get("name", "")
