from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IndexedChunk:
    chunk_id: str
    namespace: str
    source: str
    text: str
    kind: str
    chunk_index: int
