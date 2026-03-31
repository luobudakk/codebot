from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_BACKEND_ROOT / ".env"), str(_REPO_ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    api_host: str = Field(default="0.0.0.0", validation_alias="API_HOST")
    api_port: int = Field(default=8000, validation_alias="API_PORT")

    qdrant_url: str = Field(default="http://localhost:6333", validation_alias="QDRANT_URL")
    qdrant_collection: str = Field(default="advanced_rag_kb", validation_alias="QDRANT_COLLECTION")
    qdrant_vector_size: int = Field(default=1024, validation_alias="QDRANT_VECTOR_SIZE")

    neo4j_uri: str = Field(default="bolt://localhost:7687", validation_alias="NEO4J_URI")
    neo4j_user: str = Field(default="neo4j", validation_alias="NEO4J_USER")
    neo4j_password: str = Field(default="advanced-rag-dev-change-me", validation_alias="NEO4J_PASSWORD")

    embedding_model: str = Field(default="BAAI/bge-m3", validation_alias="EMBEDDING_MODEL")
    embedding_model_path: str | None = Field(default=None, validation_alias="EMBEDDING_MODEL_PATH")
    hf_endpoint: str | None = Field(default=None, validation_alias="HF_ENDPOINT")

    chunk_target_chars: int = Field(default=900, validation_alias="CHUNK_TARGET_CHARS")
    chunk_overlap_chars: int = Field(default=120, validation_alias="CHUNK_OVERLAP_CHARS")
    chunk_max_code_chars: int = Field(default=8000, validation_alias="CHUNK_MAX_CODE_CHARS")

    neo4j_enabled: bool = Field(default=True, validation_alias="NEO4J_ENABLED")

    retrieval_default_top_k: int = Field(default=100, validation_alias="RETRIEVAL_TOP_K")
    retrieval_score_threshold: float = Field(default=0.7, validation_alias="RETRIEVAL_SCORE_THRESHOLD")
    retrieval_rerank_enabled: bool = Field(default=True, validation_alias="RETRIEVAL_RERANK_ENABLED")
    retrieval_rerank_model: str = Field(
        default="BAAI/bge-reranker-base",
        validation_alias="RETRIEVAL_RERANK_MODEL",
    )
    retrieval_rerank_model_path: str | None = Field(default=None, validation_alias="RETRIEVAL_RERANK_MODEL_PATH")
    retrieval_rerank_top_pool: int = Field(default=80, validation_alias="RETRIEVAL_RERANK_TOP_POOL")

    # OpenAI-compatible API（含 Azure / 本地 vLLM / OneAPI 等）
    llm_api_key: str = Field(default="", validation_alias="LLM_API_KEY")
    llm_base_url: str | None = Field(default=None, validation_alias="LLM_BASE_URL")
    llm_model: str = Field(default="gpt-4o-mini", validation_alias="LLM_MODEL")
    llm_temperature: float = Field(default=0.3, validation_alias="LLM_TEMPERATURE")
    llm_max_tokens: int = Field(default=4096, validation_alias="LLM_MAX_TOKENS")

    judge_model: str | None = Field(default=None, validation_alias="JUDGE_MODEL")
    agent_context_max_chars: int = Field(default=12000, validation_alias="AGENT_CONTEXT_MAX_CHARS")


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
