from __future__ import annotations

from typing import List

from app.config import Settings, get_settings
from app.core import Finding, InMemoryStore, make_id
from app.ingestion.chunker import hybrid_chunk
from app.ingestion.parser import ParseError, parse_upload
from app.jobs import InMemoryJobStore
from app.retrieval.bm25_index import bm25_index
from app.retrieval.pipeline import InMemoryChunkRegistry, retrieve_hybrid
from app.security_runtime import SecurityRuntimeOrchestrator


class ServiceContainer:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self.store = InMemoryStore()
        self.jobs = InMemoryJobStore()
        self.chunk_registry = InMemoryChunkRegistry()
        self.security_runtime = SecurityRuntimeOrchestrator()

    def create_session(self, title: str):
        return self.store.create_session(title=title)

    def list_findings(self, session_id: str) -> List[Finding]:
        return self.store.findings_by_session.get(session_id, [])

    def start_scan(self, session_id: str, source_name: str, content: str):
        if session_id not in self.store.sessions:
            raise KeyError("session_not_found")
        job = self.jobs.create_job(session_id=session_id)

        def _runner():
            findings, outputs = self.security_runtime.run_scan(
                content=content,
                source_name=source_name,
            )
            self.store.add_findings(session_id=session_id, findings=findings)
            for output in outputs:
                yield output

        self.jobs.run_async(job.id, _runner)
        return job

    def ingest_knowledge(self, namespace: str, source: str, content: str) -> int:
        text, normalized_source = parse_upload(source, content.encode("utf-8"))
        chunks = hybrid_chunk(text)
        for item in chunks:
            chunk_id = make_id("chunk")
            self.chunk_registry.save(
                chunk_id=chunk_id,
                namespace=namespace,
                source=normalized_source,
                text=item.text,
            )
            bm25_index.add_documents(namespace, [(chunk_id, item.text, normalized_source)])
        return len(chunks)

    def retrieve_knowledge(self, namespace: str, query: str, top_k: int):
        return retrieve_hybrid(
            query=query,
            namespace=namespace,
            top_k=top_k,
            score_threshold=self.settings.retrieval_score_threshold,
        )

