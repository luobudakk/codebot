# Codebot 中文文档（完整版）

[主文档](README.md) | [English](README_EN.md)

Codebot 是一个面向工程团队的 AI 代码质量巡检与辅助修复平台，提供 `CLI + API + Web Console` 三种工作方式，适用于从个人开发到团队级持续治理。

> 本项目仅用于合法授权的软件工程质量改进，不包含未授权攻击、漏洞利用或渗透测试能力。

## 目录

- [产品定位](#产品定位)
- [功能总览](#功能总览)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [CLI 使用](#cli-使用)
- [API 使用](#api-使用)
- [Web 控制台](#web-控制台)
- [报告与产物](#报告与产物)
- [规则系统](#规则系统)
- [AI Provider](#ai-provider)
- [Git 自动修复策略](#git-自动修复策略)
- [权限与审计](#权限与审计)
- [部署方式](#部署方式)
- [开发与测试](#开发与测试)
- [项目结构](#项目结构)
- [常见问题](#常见问题)
- [文档索引](#文档索引)

## 产品定位

Codebot 的目标是把代码质量检查从“零散工具调用”升级为“可运营的平台能力”：

- 标准化检查链路：目标准备 -> 规则扫描 -> AI 评估 -> 报告输出
- 可控化修复流程：默认 `dry-run`，显式 `--apply` 才执行 Git 写入
- 平台化治理能力：任务队列、RBAC、审计日志、OpenAPI、Web 控制台

## 功能总览

### 质量巡检能力

- 本地目录 / Git 仓库目标接入
- 规则注册表 + 配置化启停
- AI 汇总分析与修复建议
- 报告导出：`Markdown / JSON / HTML`

### 平台能力

- 异步任务队列与状态机
- 任务分页、筛选、排序、详情查询
- 报告趋势统计
- 存储可插拔：`file` / `sqlite(sql.js)` / `postgres`

### 治理能力

- 角色模型：`admin / operator / viewer`
- token 管理与轮换
- 审计日志持久化与过滤
- 统一响应结构与错误码

## 系统架构

```text
CLI / API / Web
       |
       v
Engine: prepare -> scan -> ai-review -> report
       |
       +--> Rule Registry
       +--> AI Provider
       +--> Git Proposal (optional --apply)
       |
       v
Task Queue + Task Store + Audit Log
```

## 快速开始

### 环境要求

- Node.js `>= 20`
- npm `>= 10`
- Docker（可选）

### 安装与构建

```bash
npm install
npm run build
```

### 启动 API 与 Web

```bash
npm run start:api
```

- Health: `http://localhost:8711/health`
- Web Console: `http://localhost:8711/`

### 运行一次本地扫描

```bash
npm run start -- scan --target ./src --mode local
```

## 配置说明

配置优先级：**环境变量 > `config.yaml`**。

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `CODEBOT_API_PORT` | API 端口 | `8711` |
| `CODEBOT_API_TOKEN` | 默认 admin token | `dev-token` |
| `CODEBOT_TASK_STORE_BACKEND` | 存储后端 | `file` |
| `CODEBOT_POSTGRES_URL` | Postgres 连接串 | 空 |
| `CODEBOT_GIT_PROTECTED_BRANCHES` | 受保护分支 | `main,master` |
| `CODEBOT_GIT_COMMIT_TEMPLATE` | 提交模板 | 内置模板 |
| `CODEBOT_LLM_PROVIDER` | LLM provider | `mock` |
| `CODEBOT_LLM_MODEL` | 模型名 | `gpt-4o-mini` |
| `OPENAI_API_KEY` | OpenAI Key | 空 |

## CLI 使用

```bash
# 本地扫描
npm run start -- scan --target <path-or-git-url> --mode local

# API 模式提交任务
npm run start -- scan --target <path-or-git-url> --mode api
npm run start -- task --mode api

# 生成并应用修复（可选）
npm run start -- fix --target <path-or-git-url> --mode local --apply

# 查看生效配置
npm run start -- config
```

## API 使用

默认请求头：

```text
Authorization: Bearer <token>
Content-Type: application/json
```

关键接口：

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查 |
| `GET` | `/api/openapi.json` | OpenAPI 导出 |
| `GET` | `/api/me` | 当前角色 |
| `POST` | `/api/tasks` | 创建任务（admin/operator） |
| `GET` | `/api/tasks` | 列表查询 |
| `GET` | `/api/tasks/:id` | 任务详情 |
| `GET` | `/api/stats` | 聚合统计 |
| `GET` | `/api/reports/history` | 趋势历史 |
| `GET` | `/api/auth/tokens` | token 列表（admin） |
| `POST` | `/api/auth/rotate` | token 轮换（admin） |
| `GET` | `/api/audit/recent` | 审计日志查询（admin） |

## Web 控制台

Web 页面支持：

- 任务创建与筛选分页
- 任务详情与报告查看
- 报告统计与趋势图
- 管理员 token 面板
- 审计日志筛选查询

## 报告与产物

每次运行通常会生成：

- `reports/*.md`
- `reports/*.json`
- `reports/*.html`
- `reports/*-git-proposal.json`

## 规则系统

规则采用注册表模式，支持内置规则与 `config.yaml` 扩展规则合并，便于按团队规范持续扩展。

## AI Provider

当前支持：

- `mock`（默认）
- `openai_compat`

可在 `src/ai/providers.ts` 扩展自定义 provider。

## Git 自动修复策略

- 默认只生成修复提案，不落地改动
- `--apply` 时执行受控 Git 变更
- 受保护分支禁写、脏工作区禁写

## 权限与审计

- RBAC：`admin / operator / viewer`
- 关键操作写入审计日志，便于追踪和合规

## 部署方式

### 本机部署

```bash
npm install
npm run build
npm run start:api
```

### Docker Compose

```bash
docker compose up -d
```

## 开发与测试

```bash
npm run build
npm run test
npm run test:coverage
npm run release:preflight
```

## 项目结构

```text
.
├── src/
├── tests/
├── docs/
├── scripts/
├── config.yaml
├── docker-compose.yml
└── CHANGELOG.md
```

## 常见问题

### 为什么没有调用真实大模型？

默认 provider 是 `mock`。如需真实模型，请设置 `CODEBOT_LLM_PROVIDER=openai_compat` 和 `OPENAI_API_KEY`。

### 为什么 `fix --apply` 没执行？

常见原因：受保护分支、工作区不干净、目标不是 Git 仓库。

### 如何切换到 Postgres？

设置：

- `CODEBOT_TASK_STORE_BACKEND=postgres`
- `CODEBOT_POSTGRES_URL=postgres://...`

## 文档索引

- [主 README](README.md)
- [English README](README_EN.md)
- [运行手册](docs/RUNBOOK.md)
- [发布检查清单](docs/RELEASE_CHECKLIST.md)
- [变更日志](CHANGELOG.md)

## 许可证

建议使用 MIT 许可证。发布前请补充 `LICENSE` 文件。
