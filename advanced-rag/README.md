# advanced-rag

一个可运行的 Advanced RAG 项目，包含多路检索（向量 + BM25 + 图谱）、多智能体流式输出、前端可视化页面和离线评测脚本。

> 本项目为基于 `nanobot` 架构思想的二次开发实现，不包含上游完整源码。

## Features

- Hybrid retrieval：Qdrant 向量检索 + BM25 + 可选 Neo4j 图谱信号
- Multi-agent streaming：显式四角色链路（Planner / Coordinator / Specialist / Summary），支持 `chat` / `research` 两种模式与 SSE 实时输出
- Ingestion pipeline：文档解析、切分、向量化、入库与索引构建
- Observability：Prometheus 指标与健康检查
- Eval pipeline：检索 + 生成 + LLM-as-Judge 评分脚本

## Project Structure

```text
advanced-rag/
├── backend/              # FastAPI + RAG pipeline
├── frontend/             # Next.js UI
├── eval/                 # 离线评测脚本
├── fixtures/             # 示例数据与评测样本
├── docker-compose.yml    # Qdrant / Neo4j 本地服务
├── .env.example
└── README.md
```

## 项目完整性检查

当前项目包含并可运行以下核心部分：

- `backend/app`：FastAPI 接口与 RAG/Agent 主逻辑
- `backend/tests`：后端基础测试
- `frontend/app`：Next.js 页面（upload/chat/research/metrics）
- `frontend/lib`：前端 API/SSE 客户端
- `docker-compose.yml`：Qdrant + Neo4j 本地依赖
- `eval` / `fixtures`：评测与样例目录

## Quick Start

### 1) 环境准备

- Python 3.11+
- Node.js 18+
- Docker（用于本地 Qdrant / Neo4j）

### 2) 配置环境变量

```powershell
cd advanced-rag
Copy-Item ".env.example" ".env"
```

编辑 `.env`，至少确认这些值可用：

- `QDRANT_URL`
- `NEO4J_URI` / `NEO4J_USER` / `NEO4J_PASSWORD`
- `LLM_API_KEY`（调用 Agent 与评测脚本必需）

### 3) 启动依赖服务

```powershell
docker compose up -d qdrant neo4j
```

### 4) 启动后端

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .\backend[dev]
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

### 5) 启动前端

```powershell
cd frontend
npm install
npm run dev
```

前端默认地址：`http://localhost:3000`  
后端文档：`http://localhost:8000/docs`

## API Overview

- `GET /health`：检查 Qdrant / Neo4j 连通性
- `GET /metrics`：Prometheus 指标
- `POST /v1/ingest/upload`：上传并入库文档
- `POST /v1/retrieve`：执行检索
- `POST /v1/agents/stream`：SSE 流式智能体输出

## Evaluation

使用内置样本进行离线评测：

```powershell
python eval/run_eval.py --input fixtures/eval_sample.jsonl --out eval/out.csv
```

## Tests

```powershell
pytest backend/tests -q
```

## GitHub Upload Checklist

- `.env` 不要提交（只提交 `.env.example`）
- 确认 `node_modules`、缓存和构建产物未提交
- `git status` 只包含你期望的源码与文档变更
- 建议提交前先执行：`git add advanced-rag && git status`

## License

建议在开源发布前补充 `LICENSE`（如 MIT / Apache-2.0）。
