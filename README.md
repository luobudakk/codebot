# Code Security Runtime Portfolio

本仓库当前仅保留一个主项目：`Code Security Testing Agent`。

## 项目定位

作为实习/校招作品集（可直接查看源码结构、运行流程与测试结果）。
- 企业级代码安全审查平台（主线）
- 集成 RAG 检索增强（辅助证据与修复建议）
- 工程化分层（backend / frontend / docs / scripts / CI）

## 目录

```text
Code Security Testing Agent/
├─ backend/
├─ frontend/
├─ docs/security-assets/
├─ scripts/
└─ README.md
```

## 快速启动

```powershell
cd "Code Security Testing Agent/backend"
py -3.11 -m pip install -r requirements-dev.txt
py -3.11 -m uvicorn app.main:app --host 127.0.0.1 --port 8787
```

```powershell
cd "Code Security Testing Agent/frontend"
npm install
npm run dev
```
