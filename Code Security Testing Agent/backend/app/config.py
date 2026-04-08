from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    api_host: str = os.getenv("CSR_API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("CSR_API_PORT", "8787"))
    cors_allow_origins: str = os.getenv(
        "CSR_CORS_ALLOW_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    upload_base_dir: str = os.getenv("CSR_UPLOAD_BASE_DIR", "./tmp/uploads")
    max_file_size_mb: int = int(os.getenv("CSR_MAX_FILE_SIZE_MB", "20"))
    retrieval_top_k: int = int(os.getenv("CSR_RETRIEVAL_TOP_K", "5"))
    retrieval_score_threshold: float = float(os.getenv("CSR_RETRIEVAL_SCORE_THRESHOLD", "0.15"))


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings

