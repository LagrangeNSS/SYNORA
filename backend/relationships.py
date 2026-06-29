"""
动态关系系统。

用户在关系网里设定的只是【初始状态】。此后每一次互动，关系都会自行演变：

- affinity（好感 -100..100）：由发言的情感极性 + 双方特质相容度共同驱动。
- familiarity（熟悉度 0..100）：只要持续互动就缓慢上升。
- trust（信任 0..100）：向 好感×相容度 缓慢靠拢，怀疑型人格上升更慢。

关系为对称存储（每对一条，键按 id 排序归一）。每次变动都写一条历史快照，
供"关系演变"折线图使用；同时保留 init_affinity 以对比"初始 vs 当前"。
"""

from __future__ import annotations

from . import database as db
from .lexicon import NEGATIVE, POSITIVE


def pair_key(a: str, b: str) -> tuple[str, str]:
    return (a, b) if a <= b else (b, a)


def ensure(a: str, b: str, affinity: float = 0, label: str = "") -> None:
    a, b = pair_key(a, b)
    row = db.query_one("SELECT 1 FROM relationships WHERE a_id=? AND b_id=?", (a, b))
    now = db.now()
    if row is None:
        db.execute(
            "INSERT INTO relationships(a_id,b_id,affinity,trust,familiarity,label,"
            "init_affinity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
            (a, b, affinity, 0, 0, label, affinity, now, now),
        )


def set_initial(a: str, b: str, affinity: float, label: str,
                familiarity: float | None = None, trust: float | None = None) -> None:
    """关系网编辑：写入/更新一对关系。affinity/label 必填；familiarity/trust 可手动设定。

    传入 familiarity/trust 时按手动值写入；不传则：
    - 新建关系初始为 0；
    - 已存在关系则保留其演化出的当前值不变。
    """
    a, b = pair_key(a, b)
    now = db.now()
    existing = db.query_one("SELECT familiarity, trust FROM relationships WHERE a_id=? AND b_id=?", (a, b))

    if familiarity is not None:
        fam = max(0.0, min(100.0, familiarity))
    else:
        fam = existing["familiarity"] if existing else 0.0
    if trust is not None:
        tr = max(0.0, min(100.0, trust))
    else:
        tr = existing["trust"] if existing else 0.0

    db.execute(
        "INSERT INTO relationships(a_id,b_id,affinity,trust,familiarity,label,"
        "init_affinity,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(a_id,b_id) DO UPDATE SET affinity=excluded.affinity, "
        "init_affinity=excluded.init_affinity, label=excluded.label, "
        "familiarity=excluded.familiarity, trust=excluded.trust, updated_at=excluded.updated_at",
        (a, b, affinity, tr, fam, label, affinity, now, now),
    )


def delete(a: str, b: str) -> None:
    a, b = pair_key(a, b)
    db.execute("DELETE FROM relationships WHERE a_id=? AND b_id=?", (a, b))
    db.execute("DELETE FROM relationship_history WHERE a_id=? AND b_id=?", (a, b))


def get(a: str, b: str) -> dict | None:
    a, b = pair_key(a, b)
    row = db.query_one("SELECT * FROM relationships WHERE a_id=? AND b_id=?", (a, b))
    return dict(row) if row else None


def all_relationships() -> list[dict]:
    return [dict(r) for r in db.query("SELECT * FROM relationships")]


def for_agent(agent_id: str, name_lookup: dict[str, str]) -> dict:
    """返回 {对方名字: {affinity,label,familiarity,trust}}，供构造发言上下文。"""
    out = {}
    for r in db.query(
        "SELECT * FROM relationships WHERE a_id=? OR b_id=?", (agent_id, agent_id)
    ):
        other = r["b_id"] if r["a_id"] == agent_id else r["a_id"]
        nm = name_lookup.get(other)
        if nm:
            out[nm] = {"affinity": r["affinity"], "label": r["label"],
                       "familiarity": r["familiarity"], "trust": r["trust"]}
    return out


def _polarity(text: str) -> int:
    low = text.lower()
    pos = sum(1 for w in POSITIVE if w in low)
    neg = sum(1 for w in NEGATIVE if w in low)
    return pos - neg


def _compatibility(a: dict, b: dict) -> float:
    """两个 agent 的特质相容度，∈ 约[-1,1]。"""
    ta, tb = a.get("traits", {}), b.get("traits", {})
    warmth = (ta.get("warmth", .5) + tb.get("warmth", .5)) / 2      # 越温暖越易亲近
    humor_gap = abs(ta.get("humor", .5) - tb.get("humor", .5))      # 幽默感相近更合拍
    skeptic = (ta.get("skepticism", .5) + tb.get("skepticism", .5)) / 2
    return (warmth - 0.5) * 1.4 - humor_gap * 0.8 - (skeptic - 0.5) * 0.6


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


def update_after_interaction(speaker: dict, last_speaker: dict | None,
                             text: str, present_ids: list[str],
                             model_delta: float | None = None) -> None:
    """
    speaker 刚发言。主要更新它与 last_speaker 的关系；并与在场其他人增加一点熟悉度。

    model_delta：模型对"这次互动后我对上一位发言者的好感变化"的判断（约 -5..5）。
    给定时由它主导好感变化（更大胆、有缘由），词典情感仅作微弱兜底——
    这让关系演化贴近角色真实的心理反应，而非机械的情感词加减。
    """
    now = db.now()
    turn = db.get_turn()

    def snapshot(a_id, b_id):
        a_id, b_id = pair_key(a_id, b_id)
        r = db.query_one("SELECT * FROM relationships WHERE a_id=? AND b_id=?", (a_id, b_id))
        if r:
            db.execute(
                "INSERT INTO relationship_history(a_id,b_id,affinity,trust,familiarity,turn,created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (a_id, b_id, r["affinity"], r["trust"], r["familiarity"], turn, now),
            )

    # 与上一位发言者的"实质互动"
    if last_speaker and last_speaker["id"] != speaker["id"]:
        ensure(speaker["id"], last_speaker["id"])
        a_id, b_id = pair_key(speaker["id"], last_speaker["id"])
        r = db.query_one("SELECT * FROM relationships WHERE a_id=? AND b_id=?", (a_id, b_id))
        compat = _compatibility(speaker, last_speaker)
        if model_delta is not None:
            # 模型主导：角色自己判断这次互动让好感升/降多少，相容度只作轻微底色
            d_aff = _clamp(model_delta * 1.5 + compat * 0.4, -9, 9)
        else:
            pol = _polarity(text)
            d_aff = _clamp(pol * 2.0 + compat * 1.5, -5, 5)
        new_aff = _clamp(r["affinity"] + d_aff, -100, 100)
        new_fam = _clamp(r["familiarity"] + 1.6, 0, 100)
        skeptic = (speaker.get("traits", {}).get("skepticism", .5) +
                   last_speaker.get("traits", {}).get("skepticism", .5)) / 2
        target_trust = _clamp((new_aff * 0.6) * (1 - 0.4 * skeptic), -100, 100)
        new_trust = _clamp(r["trust"] + (target_trust - r["trust"]) * 0.12, 0, 100)
        db.execute(
            "UPDATE relationships SET affinity=?,familiarity=?,trust=?,updated_at=? "
            "WHERE a_id=? AND b_id=?",
            (round(new_aff, 2), round(new_fam, 2), round(new_trust, 2), now, a_id, b_id),
        )
        snapshot(a_id, b_id)

    # 与在场其他人增加少量熟悉度（"同处一室"效应）
    for other in present_ids:
        if other == speaker["id"]:
            continue
        if last_speaker and other == last_speaker["id"]:
            continue
        ensure(speaker["id"], other)
        a_id, b_id = pair_key(speaker["id"], other)
        r = db.query_one("SELECT * FROM relationships WHERE a_id=? AND b_id=?", (a_id, b_id))
        new_fam = _clamp(r["familiarity"] + 0.4, 0, 100)
        db.execute("UPDATE relationships SET familiarity=?,updated_at=? WHERE a_id=? AND b_id=?",
                   (round(new_fam, 2), now, a_id, b_id))


def history(a: str, b: str) -> list[dict]:
    a, b = pair_key(a, b)
    rows = db.query(
        "SELECT affinity,trust,familiarity,turn FROM relationship_history "
        "WHERE a_id=? AND b_id=? ORDER BY turn ASC", (a, b)
    )
    return [dict(r) for r in rows]
