---
name: secrets-and-supply-chain
description: 密钥泄露、依赖与供应链风险（npm/pip audit、gitleaks、trufflehog）
metadata: {"nanobot":{"emoji":"🔑","requires":{"bins":[]}}}
---

# 密钥与供应链

## 密钥与敏感配置（人工 + 工具）

**grep / ripgrep 模式**（注意排除二进制与大文件）：

- AWS：`AKIA` 形态 access key、`.aws/credentials`
- 私钥：`BEGIN RSA PRIVATE KEY`、`BEGIN OPENSSH PRIVATE KEY`
- GitHub/GitLab token：`ghp_`、`glpat-`
- 通用：`.env` 中含 `PASSWORD`、`SECRET`、`API_KEY`（需结合上下文判断是否示例）

工具（若已安装）：

```bash
gitleaks detect --source . -v
```

```bash
trufflehog filesystem .
```

Windows 下路径改为 `.\`；无工具时用 `read_file` 抽查 `.env*`、`config*`、`*.yml`、`credentials`。

## Node 供应链

```bash
npm audit
```

锁定文件完整性：建议 `package-lock.json` / `pnpm-lock.yaml` 纳入版本控制；关注 **install scripts** 与 **typosquatting**（人工阅读 `package.json`）。

## Python 供应链

```bash
pip audit -r requirements.txt
```

或：

```bash
pip-audit
```

多环境时注意 `requirements.txt` 是否与实际运行一致。

## 许可证与违规依赖（Info / Low）

若用户提供合规要求，可列出主要依赖许可证风险（需工具如 `license-check` 或平台策略 — 未安装则仅提示方向）。

## 输出建议

将**确认的真实密钥**在报告中**截断展示**（仅前后几个字符），并建议**轮换**与**从 Git 历史清除**（`git filter-repo` 等）— 具体操作由用户在其环境执行。
