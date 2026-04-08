---
name: secrets-and-supply-chain
description: 密钥泄露、依赖与供应链风险（npm/pip audit、gitleaks、trufflehog）
---

# 密钥与供应链

## 密钥与敏感配置

重点检查：

- AWS key 形态 `AKIA...`
- 私钥头 `BEGIN RSA PRIVATE KEY`
- GitHub/GitLab token（`ghp_`/`glpat-`）
- `.env`、配置文件中的 `PASSWORD` / `SECRET` / `API_KEY`

可选工具：

```bash
gitleaks detect --source . -v
trufflehog filesystem .
```

## Node 供应链

```bash
npm audit
```

关注锁文件与安装脚本风险。

## Python 供应链

```bash
pip-audit -r requirements.txt
```

## 输出要求

若发现真实密钥，报告中应脱敏展示，并给出轮换与历史清理建议。
