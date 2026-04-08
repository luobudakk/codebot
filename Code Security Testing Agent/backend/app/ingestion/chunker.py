from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class Chunk:
    text: str
    kind: str
    index: int


_CODE_FENCE_RE = re.compile(r"```(?:[^\n`]*\n)?([\s\S]*?)```", re.MULTILINE)
_SPLIT_PROSE_RE = re.compile(r"\n{2,}")


def _split_code_oversized(block: str, max_chars: int) -> List[str]:
    if len(block) <= max_chars:
        return [block]
    lines = block.splitlines(keepends=True)
    out: List[str] = []
    buf: List[str] = []
    size = 0
    for line in lines:
        if size + len(line) > max_chars and buf:
            out.append("".join(buf))
            buf = [line]
            size = len(line)
        else:
            buf.append(line)
            size += len(line)
    if buf:
        out.append("".join(buf))
    return out


def _chunk_prose_segment(text: str, target: int, overlap: int) -> List[str]:
    text = text.strip()
    if not text:
        return []
    paras = [p.strip() for p in _SPLIT_PROSE_RE.split(text) if p.strip()]
    chunks: List[str] = []
    buf = ""
    for para in paras:
        candidate = para if not buf else f"{buf}\n\n{para}"
        if len(candidate) <= target:
            buf = candidate
            continue
        if buf:
            chunks.append(buf)
        if len(para) <= target:
            buf = para
            continue
        start = 0
        while start < len(para):
            end = min(len(para), start + target)
            chunks.append(para[start:end].strip())
            if end >= len(para):
                break
            start = max(0, end - overlap)
        buf = ""
    if buf:
        chunks.append(buf)
    return [c for c in chunks if c]


def hybrid_chunk(text: str, target: int = 900, overlap: int = 120, max_code_chars: int = 8000) -> List[Chunk]:
    parts: List[tuple[str, str]] = []
    pos = 0
    for m in _CODE_FENCE_RE.finditer(text):
        if m.start() > pos:
            prose = text[pos : m.start()]
            if prose.strip():
                parts.append(("prose", prose))
        parts.append(("code", m.group(1)))
        pos = m.end()
    if pos < len(text):
        tail = text[pos:]
        if tail.strip():
            parts.append(("prose", tail))
    if not parts:
        parts = [("prose", text)]

    out: List[Chunk] = []
    idx = 0
    for kind, raw in parts:
        if kind == "code":
            for block in _split_code_oversized(raw, max_code_chars):
                block = block.strip()
                if block:
                    out.append(Chunk(text=f"```{block}\n```", kind="code", index=idx))
                    idx += 1
        else:
            for piece in _chunk_prose_segment(raw, target, overlap):
                out.append(Chunk(text=piece, kind="prose", index=idx))
                idx += 1
    return out

