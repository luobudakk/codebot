from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.config import Settings


@dataclass(frozen=True)
class Chunk:
    text: str
    kind: str  # "prose" | "code"
    index: int


# Optional language line after opening fence; inner group is code body.
_CODE_FENCE_RE = re.compile(r"```(?:[^\n`]*\n)?([\s\S]*?)```", re.MULTILINE)
_SPLIT_PROSE_RE = re.compile(r"\n{2,}")


def _split_code_oversized(block: str, max_chars: int) -> list[str]:
    if len(block) <= max_chars:
        return [block]
    lines = block.splitlines(keepends=True)
    out: list[str] = []
    buf: list[str] = []
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


def _chunk_prose_segment(text: str, target: int, overlap: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    paras = [p.strip() for p in _SPLIT_PROSE_RE.split(text) if p.strip()]
    if not paras:
        return []

    chunks: list[str] = []
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
            piece = para[start:end]
            chunks.append(piece.strip())
            if end >= len(para):
                break
            start = max(0, end - overlap)
        buf = ""

    if buf:
        chunks.append(buf)

    merged: list[str] = []
    i = 0
    while i < len(chunks):
        cur = chunks[i]
        while i + 1 < len(chunks) and len(cur) + 2 + len(chunks[i + 1]) <= target:
            cur = f"{cur}\n\n{chunks[i + 1]}"
            i += 1
        merged.append(cur)
        i += 1
    return merged


def hybrid_chunk(text: str, settings: Settings) -> list[Chunk]:
    """
    Rule-first split: fenced code blocks stay intact (then split by size if needed).
    Prose runs through paragraph merge + sliding character window.
    """
    parts: list[tuple[str, str]] = []
    pos = 0
    for m in _CODE_FENCE_RE.finditer(text):
        if m.start() > pos:
            prose = text[pos : m.start()]
            if prose.strip():
                parts.append(("prose", prose))
        code_inner = m.group(1)
        parts.append(("code", code_inner))
        pos = m.end()
    if pos < len(text):
        tail = text[pos:]
        if tail.strip():
            parts.append(("prose", tail))

    if not parts:
        parts = [("prose", text)]

    out: list[Chunk] = []
    idx = 0
    for kind, raw in parts:
        if kind == "code":
            for block in _split_code_oversized(raw, settings.chunk_max_code_chars):
                block = block.strip()
                if not block:
                    continue
                out.append(Chunk(text=f"```{block}\n```", kind="code", index=idx))
                idx += 1
            continue

        for piece in _chunk_prose_segment(raw, settings.chunk_target_chars, settings.chunk_overlap_chars):
            if piece.strip():
                out.append(Chunk(text=piece, kind="prose", index=idx))
                idx += 1

    return out
