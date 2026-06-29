"""
轻量文本向量化与相似度。

设计目标：零外部依赖、离线可用、透明可解释。
用于长期记忆的"语义检索"。默认使用词袋 + 字符 n-gram 的混合词法相似度，
足以支撑记忆检索的相关性评分。若未来接入真实 embedding（OpenAI / 本地模型），
只需替换 `embed()` 与 `similarity()` 即可，其余系统无需改动。
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Dict

# 简单的中英文停用词，过滤后让相似度更聚焦在实义词上
_STOPWORDS = set(
    """
    the a an and or but if then of to in on at for with without is are was were be been
    being this that these those it its as by from we you they he she i me my your our their
    了 的 地 得 着 和 与 及 也 都 就 还 在 是 我 你 他 她 它 我们 你们 他们 这 那 这个 那个
    一个 一种 不 没 很 太 啊 吧 呢 吗 嘛 哦 嗯 把 被 给 让 对 向 从 比
    """.split()
)

_TOKEN_RE = re.compile(r"[a-zA-Z]+|[\u4e00-\u9fff]")


def tokenize(text: str) -> list[str]:
    """英文按单词、中文按单字切分，去停用词与短词。"""
    tokens = _TOKEN_RE.findall(text.lower())
    return [t for t in tokens if t not in _STOPWORDS and len(t) >= 1]


def _char_ngrams(text: str, n: int = 3) -> list[str]:
    cleaned = re.sub(r"\s+", "", text.lower())
    if len(cleaned) < n:
        return [cleaned] if cleaned else []
    return [cleaned[i : i + n] for i in range(len(cleaned) - n + 1)]


def embed(text: str) -> Dict[str, float]:
    """
    把文本编码成稀疏词频向量（词 + 字符三元组）。
    返回 dict[token -> weight]，便于序列化进 SQLite。
    """
    vec: Counter[str] = Counter()
    for tok in tokenize(text):
        vec[f"w:{tok}"] += 1.0
    for ng in _char_ngrams(text, 3):
        vec[f"n:{ng}"] += 0.5  # 字符 n-gram 权重略低，作为辅助信号
    # L2 归一化，让长短文本可比
    norm = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return {k: v / norm for k, v in vec.items()}


def similarity(a: Dict[str, float], b: Dict[str, float]) -> float:
    """两个稀疏向量的余弦相似度（已归一化，直接点积）。"""
    if not a or not b:
        return 0.0
    # 遍历较短的那个，复杂度更低
    if len(a) > len(b):
        a, b = b, a
    return sum(weight * b.get(key, 0.0) for key, weight in a.items())


def text_similarity(text_a: str, text_b: str) -> float:
    return similarity(embed(text_a), embed(text_b))
