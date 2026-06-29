"""中英文轻量词典：情感极性 + 显著性标记。被关系系统、记忆系统、mock对话生成共用。"""

POSITIVE = {
    "good", "great", "love", "like", "agree", "thanks", "thank", "wonderful",
    "happy", "glad", "appreciate", "brilliant", "yes", "excited", "trust",
    "kind", "warm", "beautiful", "hope", "friend", "together", "support",
    "好", "喜欢", "赞", "同意", "谢谢", "感谢", "开心", "高兴", "信任", "支持",
    "美好", "希望", "朋友", "温暖", "棒", "一起", "认同", "欣赏", "期待",
}

NEGATIVE = {
    "bad", "hate", "wrong", "disagree", "angry", "annoyed", "no", "never",
    "stupid", "boring", "afraid", "fear", "sad", "tired", "doubt", "suspicious",
    "cold", "selfish", "alone", "fail", "useless", "ridiculous", "enough",
    "坏", "讨厌", "错", "反对", "生气", "愤怒", "不同意", "怀疑", "害怕",
    "无聊", "悲伤", "疲惫", "失望", "孤独", "失败", "自私", "荒谬", "冷漠",
}

# 显著性标记：含这些信号的发言更值得长期记住
SALIENT = {
    "remember", "promise", "secret", "decide", "decided", "important", "always",
    "never", "first time", "discover", "realize", "truth", "betray", "forever",
    "记住", "承诺", "秘密", "决定", "重要", "永远", "第一次", "发现", "意识到",
    "真相", "背叛", "从此", "再也", "一直",
}
