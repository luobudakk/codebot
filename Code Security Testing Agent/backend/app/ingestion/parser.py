from __future__ import annotations

from io import BytesIO
from pathlib import PurePosixPath

from pypdf import PdfReader


class ParseError(RuntimeError):
    pass


def parse_upload(filename: str, data: bytes) -> tuple[str, str]:
    suffix = PurePosixPath(filename or "upload").suffix.lower()
    source = PurePosixPath(filename).name if filename else "upload"

    if suffix in (".txt", ".md", ".markdown", ".py", ".js", ".ts", ".tsx", ".java", ".go"):
        return data.decode("utf-8", errors="replace"), source

    if suffix == ".pdf":
        try:
            reader = PdfReader(BytesIO(data))
        except Exception as exc:  # noqa: BLE001
            raise ParseError(f"Invalid PDF: {exc}") from exc
        chunks = []
        for page in reader.pages:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:  # noqa: BLE001
                chunks.append("")
        return "\n\n".join(chunks).strip(), source

    raise ParseError(f"Unsupported file type: {suffix or '(none)'}")

