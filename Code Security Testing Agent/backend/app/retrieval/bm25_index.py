from __future__ import annotations

import re
import threading
from collections import defaultdict
from typing import List, Tuple

from rank_bm25 import BM25Okapi


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[\w\u4e00-\u9fff]+", text.lower())


class NamespaceBM25Index:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._corpora: dict[str, list[tuple[str, str, str]]] = defaultdict(list)

    def add_documents(self, namespace: str, docs: List[Tuple[str, str, str]]) -> None:
        with self._lock:
            self._corpora[namespace].extend(docs)

    def search(self, namespace: str, query: str, top_k: int) -> List[Tuple[str, str, str, float]]:
        with self._lock:
            rows = list(self._corpora.get(namespace, []))
        if not rows:
            return []
        ids = [r[0] for r in rows]
        texts = [r[1] for r in rows]
        sources = [r[2] for r in rows]
        tokenized = [_tokenize(t) or ["__empty__"] for t in texts]
        q_tokens = _tokenize(query)
        if not q_tokens:
            return []
        bm25 = BM25Okapi(tokenized)
        scores = bm25.get_scores(q_tokens)
        ranked = sorted(zip(ids, texts, sources, scores, strict=True), key=lambda x: x[3], reverse=True)
        return [(i, t, s, float(sc)) for i, t, s, sc in ranked[:top_k]]


bm25_index = NamespaceBM25Index()

