---
name: static-analysis
description: 静态分析与安全扫描命令（semgrep、bandit、eslint、语言工具）；按平台选择 exec
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

## Python — Bandit

```bash
bandit -r . -f json -o bandit-report.json
```

## JavaScript / TypeScript

```bash
npm audit --json
npx eslint .
```

## Go

```bash
gosec ./...
```

## 降级策略

CLI 不可用时，基于代码阅读检查常见反模式：拼接 SQL、危险 `eval`、`exec`、`pickle`、`innerHTML`、硬编码密钥、`subprocess shell=True`、不校验重定向 URL 等。
