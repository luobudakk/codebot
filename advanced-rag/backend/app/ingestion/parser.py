from __future__ import annotations

from io import BytesIO
from pathlib import PurePosixPath

from pypdf import PdfReader


class ParseError(RuntimeError):
    pass


def parse_upload(filename: str, data: bytes) -> tuple[str, str]:
    """
    Returns (plain_text, normalized_source_name).
    Supports .txt, .md, .pdf for Phase A.
    """
    suffix = PurePosixPath(filename or "upload").suffix.lower()
    source = PurePosixPath(filename).name if filename else "upload"

    if suffix in (".txt", ".md", ".markdown"):
        text = data.decode("utf-8", errors="replace")
        return text, source

    if suffix == ".pdf":
        try:
            reader = PdfReader(BytesIO(data))
        except Exception as exc:  # noqa: BLE001 — surface as ParseError
            raise ParseError(f"Invalid PDF: {exc}") from exc
        parts: list[str] = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001
                parts.append("")
        return "\n\n".join(parts).strip(), source

    raise ParseError(f"Unsupported file type: {suffix or '(none)'} — Phase A accepts .txt, .md, .pdf")
