<div align="center">

# Codebot

**面向工程团队的 AI 代码质量巡检与辅助修复平台**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-1.1.0-brightgreen.svg)](package.json)
[![Architecture](https://img.shields.io/badge/architecture-CLI%20%7C%20API%20%7C%20Web-lightgrey.svg)](#)

中文 | [English](README_EN.md)

</div>

---

> Codebot 专注代码质量与工程治理，不包含未授权攻击、漏洞利用或渗透测试能力。

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
- [路线图](#路线图)
- [常见问题](#常见问题)
- [文档索引](#文档索引)
- [许可证](#许可证)

## 产品定位

Codebot 用于把“代码质量巡检”从一次性脚本升级为可持续运行的平台能力：

- **检查链路标准化**：目标准备 -> 规则扫描 -> AI 评估 -> 报告输出
- **修复动作可控化**：默认 `dry-run`，仅在显式 `--apply` 时执行 Git 变更
- **服务治理平台化**：任务队列、RBAC、审计日志、OpenAPI、Web 控制台
- **集成方式工程化**：支持命令行、REST API、浏览器控制台三种入口

## 功能总览

### 质量巡检

- 支持本地目录或 Git 仓库目标
- 插件化规则引擎（可配置启停、语言、严重级别）
- AI 汇总分析与修复建议生成
- 报告导出：`Markdown / JSON / HTML`

### 任务与平台

- 异步任务队列与状态机
- 任务分页、筛选、排序、详情查询
- 报告历史趋势统计
- 可插拔存储：`file` / `sqlite(sql.js)` / `postgres`

### 治理与安全

- 角色权限：`admin / operator / viewer`
- Token 轮换管理（admin）
- 审计日志持久化与过滤查询
- 统一 API 响应 envelope 与错误码

## 系统架构

```text
             +------------------+
             |      CLI         |
             +---------+--------+
                       |
                       v
 +---------------------+---------------------+
 |                  Engine                   |
 | prepare -> scan -> ai-review -> reporting |
 +---------------------+---------------------+
                       |
          +------------+------------+
          |                         |
          v                         v
   +-------------+            +-----------+
   | Rule Registry|           | AI Provider|
   +-------------+            +-----------+
          |
          v
   +-------------+      +------------------+
   | Git Proposal|----->| optional --apply |
   +-------------+      +------------------+

 +--------------------------------------------------+
 | REST API + Task Queue + Task Store + Audit Log   |
 +--------------------------+-----------------------+
                            |
                            v
                      Web Console
```

## 快速开始

### 环境要求

- Node.js `>= 20`
- npm `>= 10`
- Docker（可选）

### 1) 安装依赖并构建

```bash
npm install
npm run build
```

### 2) 启动 API 与 Web 控制台

```bash
npm run start:api
```

- Health: `http://localhost:8711/health`
- Web Console: `http://localhost:8711/`

### 3) 执行本地扫描（示例）

```bash
npm run start -- scan --target ./src --mode local
```

完成后可在 `reports/` 查看输出文件。

## 配置说明

配置优先级：**环境变量 > `config.yaml`**。  
运行时 LLM 配置会持久化到 `data/llm.runtime.json`，并按 provider profile 自动恢复。

常用环境变量：

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `CODEBOT_API_PORT` | API 服务端口 | `8711` |
| `CODEBOT_API_TOKEN` | 默认 admin token | `dev-token` |
| `CODEBOT_TASK_STORE_BACKEND` | 任务存储后端 | `file` |
| `CODEBOT_POSTGRES_URL` | Postgres 连接串 | 空 |
| `CODEBOT_GIT_PROTECTED_BRANCHES` | 受保护分支 | `main,master` |
| `CODEBOT_GIT_COMMIT_TEMPLATE` | 自动修复提交模板 | 内置模板 |
| `CODEBOT_LLM_PROVIDER` | LLM 提供方 | `mock` |
| `CODEBOT_LLM_MODEL` | 模型名 | `gpt-4o-mini` |
| `CODEBOT_LLM_BASE_URL` | 通用 LLM Base URL（可选） | 空 |
| `OPENAI_API_KEY` | OpenAI 兼容 Key | 空 |
| `OLLAMA_HOST` | Ollama 地址（provider=ollama 时可用） | `http://127.0.0.1:11434` |

## CLI 使用

### 质量扫描

```bash
npm run start -- scan --target <path-or-git-url> --mode local
```

### 提交异步任务（API 模式）

```bash
npm run start -- scan --target <path-or-git-url> --mode api
npm run start -- task --mode api
npm run start -- watch --mode api
```

### 生成并应用修复（谨慎）

```bash
npm run start -- fix --target <path-or-git-url> --mode local --apply
```

> 不带 `--apply` 时仅输出修复提案，不修改代码。

### 查看生效配置

```bash
npm run start -- config

# 查看支持的 AI provider 列表
npm run start -- providers

# 终端交互控制台（help/providers/tasks/watch/quit）
npm run start -- console
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
| `GET` | `/api/me` | 当前身份/角色 |
| `POST` | `/api/tasks` | 创建任务（admin/operator） |
| `GET` | `/api/tasks` | 列表（分页/筛选/排序） |
| `GET` | `/api/tasks/:id` | 任务详情 |
| `GET` | `/api/stats` | 聚合统计 |
| `GET` | `/api/reports/history` | 历史趋势 |
| `GET` | `/api/llm/providers` | LLM provider 注册表 |
| `GET` | `/api/tools/catalog` | Executor 工具目录 |
| `GET` | `/api/auth/tokens` | token 列表（admin） |
| `POST` | `/api/auth/rotate` | token 轮换（admin） |
| `GET` | `/api/audit/recent` | 审计查询（admin） |

## Web 控制台

Web 页面提供：

- 创建扫描任务
- 任务列表分页与筛选
- 任务详情与报告查看
- 报告统计与趋势图
- Token 管理与轮换（admin）
- 审计日志筛选查询（admin）

## 报告与产物

每次运行会生成以下产物（按会话编号命名）：

- `reports/*.md`：人类可读报告
- `reports/*.json`：结构化报告（供系统集成）
- `reports/*.html`：可直接打开的可视化报告
- `reports/*-git-proposal.json`：修复提案（dry-run / apply 元数据）

## 规则系统

规则采用注册表模式，支持：

- 内置默认规则（可直接使用）
- 在 `config.yaml` 中追加/覆盖规则
- 按规则配置 severity、语言、启停、匹配模式

适合后续扩展语言专项检查或业务规范检查。

## AI Provider

当前支持：

- `mock`（默认，无外部依赖）
- `ollama`（本地模型）
- `openai / openai_compat`
- `deepseek / qwen / groq / moonshot / zhipu / siliconflow`
- `anthropic / gemini`

此外：
- Provider 元信息由 `src/ai/provider-registry.ts` 统一维护
- 前端可通过 `/api/llm/providers` 获取可选项
- 运行时配置按 provider profile 持久化恢复

## Git 自动修复策略

`fix` 流程设计为“安全优先”：

- 默认只生成提案，不执行写入
- `--apply` 时执行受控 Git 变更（新分支、提交模板）
- 受保护分支禁止直接写入（可配置）
- 工作区不干净时拒绝执行，防止污染现有改动

## 权限与审计

- RBAC：`admin / operator / viewer`
- 重要动作写入审计日志（如创建任务、轮换 token）
- 支持按动作、状态等维度过滤查询

适合团队协作和受控运维场景。

## 部署方式

### 本机运行

```bash
npm install
npm run build
npm run start:api
```

### Docker Compose

```bash
docker compose up -d
```

具体部署细节请参考 `docs/RUNBOOK.md`。

## 开发与测试

```bash
npm run build
npm run test
npm run test:coverage
npm run release:preflight
```

CI 已配置为 push / PR 自动执行构建与测试。

## 项目结构

```text
.
├── src/
│   ├── main.ts
│   ├── core/engine.ts
│   ├── automation/
│   │   ├── pipeline.ts
│   │   └── git-workflow.ts
│   ├── rules/registry.ts
│   ├── ai/providers.ts
│   ├── reporters/writers.ts
│   ├── api/
│   │   ├── server.ts
│   │   ├── task-queue.ts
│   │   ├── task-store.ts
│   │   ├── auth.ts
│   │   ├── audit-log.ts
│   │   └── stores/
│   ├── utils/
│   └── web/index.html
├── tests/
├── docs/
├── scripts/
├── config.yaml
├── docker-compose.yml
└── CHANGELOG.md
```

## 路线图

- 增加更多语言与规则模板
- 支持规则包版本化与共享
- 引入更细粒度项目级权限模型
- 增强 Web 控制台的趋势分析与报表导出

## 常见问题

### 1) 为什么扫描没有调用大模型？

默认 provider 是 `mock`。如需真实模型，请设置 `CODEBOT_LLM_PROVIDER=openai_compat` 并配置 `OPENAI_API_KEY`。

### 2) 为什么 `fix --apply` 没有执行？

常见原因：当前分支在受保护列表、工作区有未提交改动、或目标不是 Git 仓库。

### 3) 如何切换存储后端到 Postgres？

设置：

- `CODEBOT_TASK_STORE_BACKEND=postgres`
- `CODEBOT_POSTGRES_URL=postgres://...`

并确保数据库可连接。

## 文档索引

- [中文扩展文档](README_CN.md)
- [English README](README_EN.md)
- [运行手册](docs/RUNBOOK.md)
- [发布检查清单](docs/RELEASE_CHECKLIST.md)
- [版本日志](CHANGELOG.md)

## 许可证

建议使用 MIT 许可证。发布前请补充 `LICENSE` 文件。
