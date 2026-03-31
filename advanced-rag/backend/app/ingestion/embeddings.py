from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

from app.core.config import Settings, get_settings

_model_lock = threading.Lock()
_model: Any = None


def _get_model():
    global _model
    with _model_lock:
        if _model is None:
            settings = get_settings()
            if settings.hf_endpoint:
                # huggingface_hub constants are read during import-time in some libs.
                os.environ["HF_ENDPOINT"] = settings.hf_endpoint
                os.environ["HUGGINGFACE_HUB_ENDPOINT"] = settings.hf_endpoint
            # Avoid xet CAS bridge path in restricted networks.
            os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

            from sentence_transformers import SentenceTransformer

            if settings.embedding_model_path:
                model_id = str(Path(settings.embedding_model_path).expanduser())
            else:
                model_id = settings.embedding_model
            _model = SentenceTransformer(model_id, trust_remote_code=True)
        return _model


def encode_dense(texts: list[str], batch_size: int = 16) -> list[list[float]]:
    if not texts:
        return []
    model = _get_model()
    vectors = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        normalize_embeddings=True,
    )
    return vectors.tolist()


def warmup(settings: Settings | None = None) -> None:
    _ = settings
    encode_dense(["warmup"])
