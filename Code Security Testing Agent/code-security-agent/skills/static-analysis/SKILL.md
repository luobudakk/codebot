---
name: static-analysis
description: 静态分析与安全扫描命令（semgrep、bandit、eslint、语言工具）；按平台选择 exec
metadata: {"nanobot":{"emoji":"🔍","requires":{"bins":[]}}}
---

# 静态分析与扫描

在 **exec 工具启用** 且 **用户环境已安装** 对应 CLI 时使用；否则说明缺失并继续人工阅读。

## 通用注意

- 在**项目根目录**执行；Windows 用 `cmd /c` 或 PowerShell 一行时注意引号。
- 结果仅作辅助；**误报需人工确认**。

## Semgrep（多语言）

```bash
semgrep --config auto --error .
```

无安装时：`pip install semgrep` 或使用容器（需用户自行提供）。

## Python — Bandit

```bash
bandit -r . -f json -o bandit-report.json
```

或人类可读：

```bash
bandit -r .
```

## Python — pip 依赖检查（见 supply-chain skill）

## JavaScript / TypeScript

```bash
npm audit --json
# 或
pnpm audit
```

ESLint 安全插件若已配置：

```bash
npx eslint .
```

## Go

```bash
gosec ./...
```

## Java（若已配置 Maven/Gradle）

Maven OWASP dependency-check 等通常较重，仅在用户明确允许长时间扫描时建议。

## 降级策略

CLI 不可用时：基于 `read_file` 检查常见反模式：拼接 SQL、危险 `eval`、`exec`、`pickle`、`innerHTML`、硬编码密钥、`subprocess`/`shell=True`、不校验的重定向 URL 等。
