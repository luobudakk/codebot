from __future__ import annotations

from typing import Iterable, List

from app.core import Finding
from app.security_rules import scan_content


class SecurityRuntimeOrchestrator:
    def run_scan(self, *, content: str, source_name: str) -> tuple[List[Finding], Iterable[dict]]:
        findings = scan_content(content)

        def outputs() -> Iterable[dict]:
            for item in findings:
                yield {
                    "type": "finding",
                    "data": {
                        "id": item.id,
                        "severity": item.severity,
                        "title": item.title,
                        "category": item.category,
                        "evidence": item.evidence,
                        "remediation": item.remediation,
                        "rule_id": item.rule_id,
                    },
                }
            yield {
                "type": "summary",
                "data": {"source_name": source_name, "finding_count": len(findings)},
            }

        return findings, outputs()

