from __future__ import annotations

import re
import threading
from typing import Any

from neo4j import GraphDatabase, Driver

from app.core.config import Settings
from app.ingestion.models import IndexedChunk

_driver_lock = threading.Lock()
_driver: Driver | None = None


def get_driver(settings: Settings) -> Driver | None:
    global _driver
    if not settings.neo4j_enabled:
        return None
    with _driver_lock:
        if _driver is None:
            _driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(settings.neo4j_user, settings.neo4j_password),
            )
        return _driver


def close_driver() -> None:
    global _driver
    with _driver_lock:
        if _driver is not None:
            _driver.close()
            _driver = None


def ensure_graph_schema(driver: Driver) -> None:
    stmts = [
        "CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS FOR (ch:Chunk) REQUIRE ch.chunk_id IS UNIQUE",
        "CREATE CONSTRAINT entity_key_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.entity_key IS UNIQUE",
    ]
    with driver.session() as session:
        for cypher in stmts:
            session.run(cypher)


def extract_entities_light(text: str, max_entities: int = 14) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        s = raw.strip()
        if len(s) < 2 or len(s) > 96:
            return
        key = s.lower()
        if key in seen:
            return
        seen.add(key)
        found.append(s)

    for m in re.finditer(r"^#+\s*(.+)$", text, flags=re.MULTILINE):
        add(m.group(1))
    for m in re.finditer(r"\*\*([^*]+)\*\*", text):
        add(m.group(1))
    for m in re.finditer(r"`([^`\n]{2,64})`", text):
        add(m.group(1))
    for m in re.finditer(r"\[\[([^\]]+)\]\]", text):
        add(m.group(1))
    return found[:max_entities]


def _write_chunk_tx(tx: Any, chunk: IndexedChunk, entities: list[str]) -> None:
    tx.run(
        """
        MERGE (ch:Chunk {chunk_id: $chunk_id})
        SET ch.namespace = $namespace,
            ch.source = $source,
            ch.text = $text,
            ch.kind = $kind,
            ch.chunk_index = $chunk_index
        """,
        chunk_id=chunk.chunk_id,
        namespace=chunk.namespace,
        source=chunk.source,
        text=chunk.text,
        kind=chunk.kind,
        chunk_index=chunk.chunk_index,
    )
    rows = [
        {"key": f"{chunk.namespace}::{e.strip().lower()}", "name": e.strip()}
        for e in entities
        if e.strip()
    ]
    if not rows:
        return
    tx.run(
        """
        MATCH (ch:Chunk {chunk_id: $chunk_id})
        UNWIND $entity_rows AS row
        MERGE (e:Entity {entity_key: row.key})
        ON CREATE SET e.name = row.name, e.namespace = $namespace
        MERGE (ch)-[:MENTIONS]->(e)
        """,
        chunk_id=chunk.chunk_id,
        namespace=chunk.namespace,
        entity_rows=rows,
    )


def write_indexed_chunks(driver: Driver, chunks: list[IndexedChunk]) -> None:
    if not chunks:
        return
    with driver.session() as session:
        for ch in chunks:
            ents = extract_entities_light(ch.text)
            session.execute_write(_write_chunk_tx, ch, ents)


def graph_search_chunks(
    driver: Driver,
    namespaces: list[str],
    query: str,
    top_k: int,
) -> list[tuple[str, float, str, str, str]]:
    """
    Returns list of (chunk_id, score, text, namespace, source) using Entity name overlap.
    """
    terms = [t for t in re.findall(r"[\w\u4e00-\u9fff]+", query.lower()) if len(t) >= 2]
    terms = list(dict.fromkeys(terms))[:16]
    if not terms:
        return []
    with driver.session() as session:
        rows = session.run(
            """
            UNWIND $terms AS term
            MATCH (e:Entity)
            WHERE e.namespace IN $namespaces AND toLower(e.name) CONTAINS term
            MATCH (ch:Chunk)-[:MENTIONS]->(e)
            WHERE ch.namespace IN $namespaces
            WITH ch, count(DISTINCT e) AS hits
            RETURN ch.chunk_id AS chunk_id,
                   ch.text AS text,
                   ch.namespace AS namespace,
                   ch.source AS source,
                   hits
            ORDER BY hits DESC
            LIMIT $top_k
            """,
            terms=terms,
            namespaces=namespaces,
            top_k=top_k,
        )
        out: list[tuple[str, float, str, str, str]] = []
        for r in rows:
            hits = float(r["hits"] or 0)
            score = min(1.0, hits / 4.0)
            out.append((r["chunk_id"], score, r["text"], r["namespace"], r["source"]))
        return out
