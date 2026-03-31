from __future__ import annotations

from app.core.config import Settings
from app.ingestion.chunker import hybrid_chunk
from app.ingestion.parser import ParseError, parse_upload


def test_parse_md_roundtrip():
    raw = "# Title\n\n正文\n".encode("utf-8")
    text, name = parse_upload("doc.md", raw)
    assert name == "doc.md"
    assert "正文" in text


def test_parse_rejects_unknown_ext():
    try:
        parse_upload("x.bin", b"ab")
    except ParseError as e:
        assert "Unsupported" in str(e)
    else:
        raise AssertionError("expected ParseError")


def test_chunker_keeps_code_fence_single_chunk(monkeypatch):
    monkeypatch.setenv("CHUNK_TARGET_CHARS", "900")
    monkeypatch.setenv("CHUNK_OVERLAP_CHARS", "120")
    monkeypatch.setenv("CHUNK_MAX_CODE_CHARS", "8000")
    settings = Settings()
    doc = """Intro line.

```python
x = 1
y = 2
```

Outro."""
    chunks = hybrid_chunk(doc, settings)
    kinds = [c.kind for c in chunks]
    assert "code" in kinds
    code_chunks = [c for c in chunks if c.kind == "code"]
    assert len(code_chunks) == 1
    assert "```python" in code_chunks[0].text or "```" in code_chunks[0].text


def test_chunker_splits_long_prose(monkeypatch):
    monkeypatch.setenv("CHUNK_TARGET_CHARS", "80")
    monkeypatch.setenv("CHUNK_OVERLAP_CHARS", "10")
    monkeypatch.setenv("CHUNK_MAX_CODE_CHARS", "8000")
    settings = Settings()
    # 单行长段落（无 \\n\\n），应被滑窗切成多段
    filler = ("abcdefgh " * 40).strip()
    assert len(filler) > settings.chunk_target_chars
    chunks = hybrid_chunk(filler, settings)
    assert len(chunks) >= 2
    assert all(c.kind == "prose" for c in chunks)
