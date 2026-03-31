from __future__ import annotations

import re
import threading
from collections import defaultdict

from rank_bm25 import BM25Okapi


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[\w\u4e00-\u9fff]+", text.lower())


class NamespaceBM25Index:
    """In-process BM25 corpus per namespace (updated on ingest). Single-process MVP."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._corpora: dict[str, list[tuple[str, str]]] = defaultdict(list)

    def add_documents(self, namespace: str, doc_ids_texts: list[tuple[str, str]]) -> None:
        if not doc_ids_texts:
            return
        with self._lock:
            self._corpora[namespace].extend(doc_ids_texts)

    def search(self, namespace: str, query: str, top_k: int) -> list[tuple[str, str, float]]:
        """Returns (chunk_id, text, bm25_raw_score)."""
        with self._lock:
            corpus_pairs = list(self._corpora.get(namespace, []))
        if not corpus_pairs or top_k <= 0:
            return []
        ids = [p[0] for p in corpus_pairs]
        texts = [p[1] for p in corpus_pairs]
        tokenized = [_tokenize(t) for t in texts]
        q_tokens = _tokenize(query)
        if not q_tokens:
            return []
        for doc in tokenized:
            if not doc:
                doc.append("__empty__")
        bm25 = BM25Okapi(tokenized)
        scores = bm25.get_scores(q_tokens)
        ranked = sorted(
            zip(ids, texts, scores, strict=True),
            key=lambda x: x[2],
            reverse=True,
        )
        return [(i, t, float(s)) for i, t, s in ranked[:top_k]]

    def clear_namespace(self, namespace: str) -> None:
        with self._lock:
            self._corpora.pop(namespace, None)


bm25_index = NamespaceBM25Index()
