from __future__ import annotations

import re
from typing import List


def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[\w\u4e00-\u9fff]+", text.lower()))


def rerank_pairs(query: str, docs: List[str]) -> List[float]:
    q_tokens = _tokenize(query)
    if not q_tokens:
        return [0.0 for _ in docs]
    scores: List[float] = []
    for doc in docs:
        d_tokens = _tokenize(doc)
        if not d_tokens:
            scores.append(0.0)
            continue
        inter = len(q_tokens & d_tokens)
        union = len(q_tokens | d_tokens)
        scores.append(inter / max(1, union))
    return scores

