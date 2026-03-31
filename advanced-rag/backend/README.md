# Backend

FastAPI 后端，负责文档入库、混合检索、多智能体编排和指标暴露。

当前研究模式采用显式四角色结构：

- Planner：拆解问题并产出依赖计划
- Coordinator：按波次调度并发 Specialist
- Specialist：按角色执行子任务
- Summary：汇总专家输出给出最终答复

## Main Modules

- `app/api`：HTTP 路由（health / metrics / ingest / retrieve / agents）
- `app/ingestion`：文档解析、切分、向量化、Qdrant 写入
- `app/retrieval`：向量检索、BM25、图谱增强、重排
- `app/agents`：`chat` / `research` 流式编排（SSE）
- `app/core`：配置与监控指标

## Run Locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .\backend[dev]
uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

## Test

```powershell
pytest backend/tests -q
```
