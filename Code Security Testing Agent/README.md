# Code Security Runtime（企业级代码安全审查平台）

该项目是面向求职展示的企业化安全工程项目，主线是“代码安全审查”，并融合了 `advanced-rag` 的知识检索能力。  
架构设计参考企业 Runtime 分层方式，强调流程可控、输出可追溯、工程可维护。

## 核心能力

- **代码安全审查闭环**：创建审查会话 -> 发起扫描任务 -> 异步作业追踪 -> 输出漏洞与修复建议
- **风险发现与分级**：覆盖 SQL 注入、命令注入、硬编码密钥、危险执行等高频安全模式
- **证据化输出**：每条发现包含类别、证据片段、修复建议、规则标识
- **安全知识 RAG**：支持知识入库与检索，辅助安全判断和修复决策
- **企业化流程**：预留扩展位（SSE、任务编排、依赖注入、分层模块）

## 架构分层

- `backend/app/contracts.py`：统一 API 契约
- `backend/app/services.py`：服务容器与业务组装
- `backend/app/security_runtime.py`：安全审查运行时编排
- `backend/app/ingestion/*`：文档解析与切块（迁移自 advanced-rag 思路）
- `backend/app/retrieval/*`：检索与重排（BM25 + 轻量 rerank）
- `frontend/*`：安全控制台与知识检索控制台

## 项目结构

```text
Code Security Testing Agent/
├─ backend/
│  ├─ app/
│  │  ├─ ingestion/
│  │  ├─ retrieval/
│  │  └─ ...
│  ├─ tests/
│  ├─ requirements.txt
│  ├─ requirements-dev.txt
│  └─ requirements-optional.txt
├─ frontend/
│  ├─ app/
│  ├─ components/
│  ├─ lib/
│  └─ tests/
├─ docs/security-assets/
│  ├─ skills/
│  └─ playbooks/
├─ .github/workflows/ci.yml
├─ docker-compose.yml
└─ .env.example
```

## 本地运行（Windows）

### 启动后端

```powershell
cd "C:\Users\jinziqi\Desktop\2026\Code Security Testing Agent\backend"
py -3.11 -m pip install -r requirements-dev.txt
py -3.11 -m uvicorn app.main:app --host 127.0.0.1 --port 8787
```

### 启动前端

```powershell
cd "C:\Users\jinziqi\Desktop\2026\Code Security Testing Agent\frontend"
npm install
npm run dev
```

- API: `http://127.0.0.1:8787`
- Web: `http://127.0.0.1:3000`

## 测试

### 后端

```powershell
cd "C:\Users\jinziqi\Desktop\2026\Code Security Testing Agent\backend"
py -3.11 -m pytest -q
```

### 前端

```powershell
cd "C:\Users\jinziqi\Desktop\2026\Code Security Testing Agent\frontend"
npm test -- --runInBand
```

## 面向求职的亮点

- 安全业务主线明确：从“检测”到“修复建议”的完整路径
- 有工程分层与可扩展设计，不是一次性脚本
- 有测试与 CI，体现可交付能力
- 融合 RAG 能力，体现 AI 工程能力与安全领域结合

