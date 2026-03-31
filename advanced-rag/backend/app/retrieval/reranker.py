from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from app.core.config import Settings, get_settings

_model_lock = threading.Lock()
_model: Any = None


def _get_cross_encoder(settings: Settings):
    global _model
    with _model_lock:
        if _model is None:
            from sentence_transformers import CrossEncoder

            if settings.retrieval_rerank_model_path:
                path = str(Path(settings.retrieval_rerank_model_path).expanduser())
            else:
                path = settings.retrieval_rerank_model
            _model = CrossEncoder(path, max_length=512, trust_remote_code=True)
        return _model


def rerank_pairs(query: str, documents: list[str], settings: Settings | None = None) -> list[float]:
    if not documents:
        return []
    settings = settings or get_settings()
    model = _get_cross_encoder(settings)
    pairs = [[query, doc] for doc in documents]
    raw = model.predict(pairs, show_progress_bar=False)
    import numpy as np

    arr = np.asarray(raw).ravel()
    return [float(x) for x in arr]
