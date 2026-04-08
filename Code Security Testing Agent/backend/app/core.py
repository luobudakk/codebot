from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Dict, List


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def make_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(4)}"


@dataclass
class SecuritySession:
    id: str
    title: str
    created_at: str


@dataclass
class Finding:
    id: str
    severity: str
    title: str
    category: str
    evidence: str
    remediation: str
    rule_id: str


@dataclass
class SecurityJob:
    id: str
    session_id: str
    status: str
    progress: int
    outputs: List[dict] = field(default_factory=list)
    error_message: str = ""


class InMemoryStore:
    def __init__(self) -> None:
        self.sessions: Dict[str, SecuritySession] = {}
        self.findings_by_session: Dict[str, List[Finding]] = {}
        self.jobs: Dict[str, SecurityJob] = {}
        self._lock = Lock()

    def create_session(self, title: str) -> SecuritySession:
        with self._lock:
            session = SecuritySession(id=make_id("sess"), title=title, created_at=utcnow())
            self.sessions[session.id] = session
            self.findings_by_session.setdefault(session.id, [])
            return session

    def add_findings(self, session_id: str, findings: List[Finding]) -> None:
        with self._lock:
            self.findings_by_session.setdefault(session_id, []).extend(findings)

