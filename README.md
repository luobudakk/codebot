# AI Security Projects Portfolio

本仓库包含两个独立但互补的 AI 工程项目，聚焦于：

- **代码安全多智能体编排**
- **Advanced RAG 检索增强与评测**

作为实习/校招作品集（可直接查看源码结构、运行流程与测试结果）。

## Repository Layout

```text
2026/
├── Code Security Testing Agent/
│   ├── code-security-agent/   # 安全审阅 workspace（规则、技能、playbooks）
│   └── code-security-web/     # FastAPI + Web/TUI 入口
└── advanced-rag/
    ├── backend/               # FastAPI + retrieval + agents
    ├── frontend/              # Next.js UI
    ├── eval/                  # 离线评测脚本
    └── fixtures/              # 样例与评测数据
```

## Project A: Code Security Testing Agent

- 路径：`Code Security Testing Agent/`
- 说明文档：[Project README](./Code%20Security%20Testing%20Agent/README.md)
- 目标：将“代码安全审阅”流程工程化，支持上传代码后自动拆任务并并发分析

### Core Capabilities

- **Multi-agent security workflow**: Planner -> Coordinator -> Worker -> Summary
- **Security-oriented workspace**: `AGENTS.md` + `skills/` + `playbooks/`
- **Web-first experience**: FastAPI + 静态页面，支持运行时参数配置
- **Operational scripts**: `start.ps1` / `start.bat` / `cli.ps1`

### Engineering Highlights

- 面向代码安全场景抽象了 route（auth/injection/deps/secrets/general）
- 将任务调度与审阅提示分层，便于扩展子智能体能力
- 对运行时敏感数据（sessions/uploads/ui settings）做了提交隔离策略

## Project B: advanced-rag

- 路径：`advanced-rag/`
- 说明文档：[Project README](./advanced-rag/README.md)
- 目标：构建可运行、可评测、可观测的 Advanced RAG 系统

### Core Capabilities

- **Hybrid retrieval**: Qdrant 向量检索 + BM25 + 可选 Neo4j 图谱信号
- **Explicit 4-role agents**: Planner / Coordinator / Specialist / Summary
- **Streaming interaction**: `/v1/agents/stream` SSE 实时输出
- **Offline evaluation**: `eval/run_eval.py` 评测链路

### Engineering Highlights

- 前后端分离（FastAPI + Next.js）并保持接口契约清晰
- 引入 Prometheus metrics 与 health 接口支持可观测性
- 后端单测可运行（`pytest backend/tests -q`）
- 前端生产构建可通过（`next build`）

## Tech Stack

- **Backend**: Python, FastAPI, Pydantic, Uvicorn
- **LLM / Agent**: OpenAI-compatible APIs, multi-agent orchestration
- **Retrieval**: Qdrant, BM25, Neo4j (optional)
- **Frontend**: Next.js 14, TypeScript, SSE
- **Tooling**: Pytest, npm scripts, Docker Compose

## Quick Reproduce

### 1) Run `Code Security Testing Agent`

```powershell
cd "Code Security Testing Agent\code-security-web"
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8787
```

### 2) Run `advanced-rag`

```powershell
cd "advanced-rag"
docker compose up -d qdrant neo4j
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .\backend[dev]
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

Frontend:

```powershell
cd "advanced-rag\frontend"
npm install
npm run dev
```

## What Reviewers Can Check Quickly

- 架构拆分是否清晰：查看各项目 README 的结构图与模块目录
- 工程可运行性：按 Quick Reproduce 启动并访问 API/前端页面
- 代码质量与可测试性：运行 `pytest` 与 `next build`
- 安全与工程意识：查看 `.gitignore`、配置模板、运行数据隔离策略

## Notes

- 两个项目是独立项目，统一放在同一仓库中便于集中展示。
- 运行前请复制示例配置（如 `.env.example`）并填入本机有效值。
