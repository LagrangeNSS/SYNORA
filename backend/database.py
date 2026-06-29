"""
SQLite 持久化层。

长期记忆稳定性的根基：所有状态（人格、记忆、关系、随时间演变的快照）
都落盘到一个单一的 .db 文件，进程重启后完整恢复。
启用 WAL 模式以保证在长期、频繁写入下的稳定与一致性。
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from typing import Any, Iterable, Optional

_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "society.db")
_local = threading.local()


def _conn() -> sqlite3.Connection:
    """每线程一个连接（FastAPI 默认多线程）。"""
    conn = getattr(_local, "conn", None)
    if conn is None:
        os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
        conn = sqlite3.connect(_DB_PATH, check_same_thread=False, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")      # 长期写入稳定
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    -- 不可变的人格锚点：核心身份与价值观，每一轮都会重新注入以对抗漂移
    identity    TEXT NOT NULL DEFAULT '',
    values_anchor TEXT NOT NULL DEFAULT '',
    background  TEXT NOT NULL DEFAULT '',
    speaking_style TEXT NOT NULL DEFAULT '',
    -- 人格特质向量（JSON: {trait: 0..1}），驱动行为与一致性度量
    traits      TEXT NOT NULL DEFAULT '{}',
    created_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id    TEXT NOT NULL,
    content     TEXT NOT NULL,
    turn        INTEGER NOT NULL,
    created_at  REAL NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id    TEXT NOT NULL,
    kind        TEXT NOT NULL,          -- episodic | semantic | reflection
    content     TEXT NOT NULL,
    importance  REAL NOT NULL DEFAULT 5,-- 1..10
    embedding   TEXT NOT NULL DEFAULT '{}',
    created_turn INTEGER NOT NULL DEFAULT 0,
    created_at  REAL NOT NULL,
    last_access REAL NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relationships (
    a_id        TEXT NOT NULL,
    b_id        TEXT NOT NULL,
    affinity    REAL NOT NULL DEFAULT 0,   -- -100..100  好感/敌意
    trust       REAL NOT NULL DEFAULT 0,   -- 0..100
    familiarity REAL NOT NULL DEFAULT 0,   -- 0..100
    label       TEXT NOT NULL DEFAULT '',  -- 用户给定的初始关系标签
    init_affinity REAL NOT NULL DEFAULT 0, -- 保留初始状态，便于对比"初始 vs 当前"
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL,
    PRIMARY KEY (a_id, b_id),
    FOREIGN KEY (a_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (b_id) REFERENCES agents(id) ON DELETE CASCADE
);

-- 关系随时间演变的历史，用于图表呈现
CREATE TABLE IF NOT EXISTS relationship_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    a_id        TEXT NOT NULL,
    b_id        TEXT NOT NULL,
    affinity    REAL NOT NULL,
    trust       REAL NOT NULL,
    familiarity REAL NOT NULL,
    turn        INTEGER NOT NULL,
    created_at  REAL NOT NULL
);

-- 人格一致性快照，用于"人格稳定性"图表
CREATE TABLE IF NOT EXISTS personality_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id    TEXT NOT NULL,
    consistency REAL NOT NULL,    -- 0..1，近期行为与核心人格的吻合度
    turn        INTEGER NOT NULL,
    created_at  REAL NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def init_db() -> None:
    conn = _conn()
    conn.executescript(SCHEMA)
    conn.commit()
    # 幂等迁移：为老库补上"内心活动"列（先思考再说话所需）
    for ddl in (
        "ALTER TABLE messages ADD COLUMN thinking TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE messages ADD COLUMN mood TEXT NOT NULL DEFAULT ''",
    ):
        try:
            conn.execute(ddl); conn.commit()
        except Exception:
            pass
    if get_meta("turn") is None:
        set_meta("turn", "0")
    if get_meta("anchor_enabled") is None:
        # 人格锚点开关：默认开启。关闭后可观察长期人格漂移（用于对比演示）。
        set_meta("anchor_enabled", "1")


# ---------- 通用辅助 ----------

def query(sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
    cur = _conn().execute(sql, tuple(params))
    return cur.fetchall()


def query_one(sql: str, params: Iterable[Any] = ()) -> Optional[sqlite3.Row]:
    cur = _conn().execute(sql, tuple(params))
    return cur.fetchone()


def execute(sql: str, params: Iterable[Any] = ()) -> int:
    conn = _conn()
    cur = conn.execute(sql, tuple(params))
    conn.commit()
    return cur.lastrowid


def get_meta(key: str) -> Optional[str]:
    row = query_one("SELECT value FROM meta WHERE key=?", (key,))
    return row["value"] if row else None


def set_meta(key: str, value: str) -> None:
    execute(
        "INSERT INTO meta(key,value) VALUES(?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, value),
    )


def get_turn() -> int:
    return int(get_meta("turn") or "0")


def bump_turn() -> int:
    t = get_turn() + 1
    set_meta("turn", str(t))
    return t


def anchor_enabled() -> bool:
    return (get_meta("anchor_enabled") or "1") == "1"


def now() -> float:
    return time.time()


def reset_world(keep_agents: bool = True) -> None:
    """清空对话/记忆/历史，可选保留 agent 与关系定义。用于重新开始一次长期模拟。"""
    conn = _conn()
    conn.execute("DELETE FROM messages")
    conn.execute("DELETE FROM memories")
    conn.execute("DELETE FROM relationship_history")
    conn.execute("DELETE FROM personality_snapshots")
    if not keep_agents:
        conn.execute("DELETE FROM relationships")
        conn.execute("DELETE FROM agents")
    else:
        # 把关系回滚到用户设定的初始状态
        conn.execute(
            "UPDATE relationships SET affinity=init_affinity, trust=0, "
            "familiarity=0, updated_at=?",
            (now(),),
        )
    set_meta("turn", "0")
    conn.commit()
