"""
长期记忆系统（核心模块之一）。

借鉴 Stanford「Generative Agents」的记忆流设计，并针对"长期运行下的存储稳定性"
做了关键加固：

1) 分层记忆：episodic（情节）/ semantic（语义，由巩固产生）/ reflection（反思）。
2) 检索评分 = 相关性 + 新近度 + 重要性，三者归一后加权（可解释）。
3) 记忆巩固（consolidation）：当情节记忆超过容量上限时，把最旧、最不重要的一批
   压缩成一条"语义记忆"，从而让总量有界——这是长期不膨胀、不丢失要点的关键。
4) 反思（reflection）：周期性地从高重要性记忆里提炼更高层洞察。

社会动力学全部由本地透明逻辑计算，便于检视与复现。
"""

from __future__ import annotations

import json
import math
from collections import Counter

from . import database as db
from . import embeddings as emb
from .lexicon import NEGATIVE, POSITIVE, SALIENT

EPISODIC_CAP = 40          # 单个 agent 的情节记忆上限，超过即触发巩固
CONSOLIDATE_BATCH = 12     # 每次巩固压缩多少条
REFLECT_EVERY = 15         # 每隔多少轮做一次反思
RECENCY_HALFLIFE = 20.0    # 新近度按轮数指数衰减的半衰期


# ---------- 重要性评分（启发式，对任意文本可用） ----------

def score_importance(text: str, agent_names: list[str]) -> float:
    low = text.lower()
    score = 3.0
    score += min(len(text) / 60.0, 2.0)                     # 越长通常信息越多（封顶）
    score += sum(1.5 for w in SALIENT if w in low)          # 显著标记词
    score += 0.6 * sum(1 for w in POSITIVE if w in low)
    score += 0.6 * sum(1 for w in NEGATIVE if w in low)
    score += 1.0 * sum(1 for n in agent_names if n and n in text)  # 提到了别人
    if "?" in text or "？" in text:
        score += 0.8
    return max(1.0, min(10.0, score))


# ---------- 写入 ----------

def add_memory(agent_id: str, content: str, kind: str = "episodic",
               importance: float | None = None, agent_names: list[str] | None = None) -> int:
    if importance is None:
        importance = score_importance(content, agent_names or [])
    now = db.now()
    mid = db.execute(
        "INSERT INTO memories(agent_id,kind,content,importance,embedding,"
        "created_turn,created_at,last_access,access_count) "
        "VALUES(?,?,?,?,?,?,?,?,0)",
        (agent_id, kind, content, importance,
         json.dumps(emb.embed(content)), db.get_turn(), now, now),
    )
    return mid


# ---------- 检索：相关性 + 新近度 + 重要性 ----------

def retrieve(agent_id: str, query: str, k: int = 4) -> list[dict]:
    rows = db.query("SELECT * FROM memories WHERE agent_id=?", (agent_id,))
    if not rows:
        return []
    qvec = emb.embed(query)
    cur_turn = db.get_turn()
    scored = []
    for r in rows:
        try:
            mvec = json.loads(r["embedding"])
        except Exception:
            mvec = {}
        relevance = emb.similarity(qvec, mvec)
        age = max(0, cur_turn - r["created_turn"])
        recency = math.pow(0.5, age / RECENCY_HALFLIFE)
        importance = r["importance"] / 10.0
        # 反思/语义记忆作为"长期沉淀"给一点权重加成，使其更容易被想起
        bonus = 0.15 if r["kind"] in ("reflection", "semantic") else 0.0
        score = 1.0 * relevance + 0.5 * recency + 0.6 * importance + bonus
        scored.append((score, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    top = scored[:k]
    # 命中即"被回忆"：更新访问信息，让常被想起的记忆更稳固
    now = db.now()
    for _, r in top:
        db.execute(
            "UPDATE memories SET last_access=?, access_count=access_count+1 WHERE id=?",
            (now, r["id"]),
        )
    return [dict(r) for _, r in top]


# ---------- 巩固：让长期存储有界且不丢要点 ----------

def _summarize(texts: list[str]) -> str:
    """无外部依赖的抽取式摘要：取最高频实义词，拼出一条语义记忆。"""
    counter: Counter[str] = Counter()
    for t in texts:
        for tok in emb.tokenize(t):
            counter[tok] += 1
    keywords = [w for w, _ in counter.most_common(8)]
    return "（早期记忆的沉淀）这段时间反复围绕：" + "、".join(keywords) if keywords \
        else "（早期记忆的沉淀）一段已淡化但留有印象的经历。"


def consolidate(agent_id: str) -> bool:
    """若情节记忆超限，把最旧且最不重要的一批压缩成一条语义记忆。返回是否发生巩固。"""
    rows = db.query(
        "SELECT * FROM memories WHERE agent_id=? AND kind='episodic'", (agent_id,)
    )
    if len(rows) <= EPISODIC_CAP:
        return False
    # 选出"最该被遗忘"的：越旧、越不重要、越少被回忆，优先压缩
    cur_turn = db.get_turn()
    def forget_rank(r):
        age = cur_turn - r["created_turn"]
        return age * 1.0 - r["importance"] * 3.0 - r["access_count"] * 2.0
    rows_sorted = sorted(rows, key=forget_rank, reverse=True)
    batch = rows_sorted[:CONSOLIDATE_BATCH]
    summary = _summarize([r["content"] for r in batch])
    # 写入语义记忆（重要性取批次均值，保留一定权重）
    avg_imp = sum(r["importance"] for r in batch) / len(batch)
    add_memory(agent_id, summary, kind="semantic", importance=min(8.0, avg_imp + 1.0))
    # 删除被压缩的情节记忆 —— 总量回落，长期不膨胀
    ids = [r["id"] for r in batch]
    db.execute(
        f"DELETE FROM memories WHERE id IN ({','.join('?' * len(ids))})", ids
    )
    return True


# ---------- 反思：从高重要性记忆提炼洞察 ----------

def reflect(agent_id: str, agent_name: str) -> str | None:
    if db.get_turn() % REFLECT_EVERY != 0 or db.get_turn() == 0:
        return None
    rows = db.query(
        "SELECT * FROM memories WHERE agent_id=? ORDER BY importance DESC, created_at DESC LIMIT 8",
        (agent_id,),
    )
    if len(rows) < 4:
        return None
    counter: Counter[str] = Counter()
    sentiment = 0
    for r in rows:
        for tok in emb.tokenize(r["content"]):
            counter[tok] += 1
        low = r["content"].lower()
        sentiment += sum(1 for w in POSITIVE if w in low)
        sentiment -= sum(1 for w in NEGATIVE if w in low)
    themes = "、".join(w for w, _ in counter.most_common(4))
    mood = "整体是积极、被支持的" if sentiment > 0 else \
           "带着一些紧张或分歧" if sentiment < 0 else "比较平静"
    insight = f"（反思）最近我反复在意的是：{themes}。这段经历的基调{mood}。"
    add_memory(agent_id, insight, kind="reflection", importance=8.0)
    return insight


# ---------- 统计（供图表使用） ----------

def stats(agent_id: str) -> dict:
    rows = db.query(
        "SELECT kind, COUNT(*) c, AVG(importance) ai FROM memories "
        "WHERE agent_id=? GROUP BY kind", (agent_id,)
    )
    out = {"episodic": 0, "semantic": 0, "reflection": 0, "total": 0, "avg_importance": 0.0}
    total_imp, total_n = 0.0, 0
    for r in rows:
        out[r["kind"]] = r["c"]
        out["total"] += r["c"]
        total_imp += (r["ai"] or 0) * r["c"]
        total_n += r["c"]
    out["avg_importance"] = round(total_imp / total_n, 2) if total_n else 0.0
    return out


def importance_histogram(agent_id: str) -> list[int]:
    """重要性 1..10 的分布直方图（10个桶）。"""
    rows = db.query("SELECT importance FROM memories WHERE agent_id=?", (agent_id,))
    buckets = [0] * 10
    for r in rows:
        idx = min(9, max(0, int(r["importance"]) - 1))
        buckets[idx] += 1
    return buckets
