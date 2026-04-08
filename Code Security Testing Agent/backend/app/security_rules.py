from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List

from app.core import Finding, make_id


@dataclass(frozen=True)
class Rule:
    rule_id: str
    title: str
    severity: str
    category: str
    pattern: str
    remediation: str


RULES: List[Rule] = [
    Rule(
        rule_id="CWE-89-SQL-STRING",
        title="检测到可能的 SQL 拼接",
        severity="high",
        category="Injection",
        pattern=r"(SELECT|INSERT|UPDATE|DELETE).*(\+|f['\"])",
        remediation="改为参数化查询或 ORM 绑定参数，避免字符串拼接构建 SQL。",
    ),
    Rule(
        rule_id="CWE-94-EVAL",
        title="检测到危险的 eval/exec 调用",
        severity="critical",
        category="Code Injection",
        pattern=r"\b(eval|exec)\s*\(",
        remediation="移除动态执行逻辑，改用白名单映射或安全解释器。",
    ),
    Rule(
        rule_id="CWE-78-SHELL-TRUE",
        title="检测到 subprocess shell=True",
        severity="high",
        category="Command Injection",
        pattern=r"subprocess\.(run|Popen)\(.*shell\s*=\s*True",
        remediation="关闭 shell=True，并对命令参数做白名单校验。",
    ),
    Rule(
        rule_id="CWE-798-HARDCODED-SECRET",
        title="检测到可能的硬编码密钥",
        severity="high",
        category="Secrets",
        pattern=r"(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|api[_-]?key\s*=\s*['\"][^'\"]+['\"])",
        remediation="将密钥移至密钥管理系统或环境变量，并轮换已泄露密钥。",
    ),
    Rule(
        rule_id="CWE-20-UNVALIDATED-REDIRECT",
        title="检测到可能的未校验重定向/URL 请求",
        severity="medium",
        category="SSRF",
        pattern=r"(requests\.(get|post)|httpx\.(get|post)).*url",
        remediation="限制可访问域名/协议，拦截内网地址与元数据地址。",
    ),
]


def scan_content(content: str) -> List[Finding]:
    findings: List[Finding] = []
    lines = content.splitlines()
    for rule in RULES:
        regex = re.compile(rule.pattern, re.IGNORECASE)
        for idx, line in enumerate(lines, start=1):
            if regex.search(line):
                findings.append(
                    Finding(
                        id=make_id("finding"),
                        severity=rule.severity,
                        title=rule.title,
                        category=rule.category,
                        evidence=f"L{idx}: {line[:200]}",
                        remediation=rule.remediation,
                        rule_id=rule.rule_id,
                    )
                )
    if not findings:
        findings.append(
            Finding(
                id=make_id("finding"),
                severity="info",
                title="未发现高置信度风险模式",
                category="Audit",
                evidence="当前规则集未命中显著风险模式，建议补充项目特定规则后复审。",
                remediation="补充自定义规则并对关键模块进行人工复核。",
                rule_id="INFO-NO-HIT",
            )
        )
    return findings

