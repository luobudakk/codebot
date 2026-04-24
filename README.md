<div align="center">

# Codebot

**AI 驱动的自动化代码质量巡检与辅助修复平台**

[![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-1.1.0-brightgreen.svg)](package.json)
[![Architecture](https://img.shields.io/badge/architecture-CLI%20%7C%20API%20%7C%20Web-lightgrey.svg)](#)

中文 | [English](README_EN.md)

</div>

---

> 本项目专注代码质量治理，不包含任何未授权攻击、漏洞利用或渗透测试能力。

## 为什么是 Codebot

- 完整 TypeScript 架构，覆盖 `CLI + API + Web Console`
- 采用模块化、编排化、可观测、可扩展的工程架构
- 规则引擎 + AI 评估 + 报告聚合 + 可控修复提案
- 面向团队协作：角色鉴权、审计追踪、API 文档、发布流程

## 核心能力

### 质量巡检链路

- 自动准备目标（本地代码目录 / Git 仓库）
- 插件化规则扫描（按语言、级别、启停配置）
- AI 汇总与修复建议生成
- 输出结构化报告（`Markdown / JSON / HTML`）
- 可选 `fix --apply`（默认 `dry-run`）

### 平台化能力

- 可插拔任务存储：`file` / `sqlite(sql.js)` / `postgres`
- 任务状态机：`queued / running / succeeded / failed / cancelled`
- API 聚合统计：`/api/stats`
- 历史趋势接口：`/api/reports/history`
- OpenAPI 导出：`/api/openapi.json`

### 安全治理能力

- 多 token + 角色鉴权（`admin / operator / viewer`）
- Token 轮换接口（admin）
- 审计日志持久化与查询过滤
- 统一响应 envelope 与错误码

## 系统要求

- Node.js `>= 20`
- npm `>= 10`（推荐）
- Docker（可选，用于一键联调）

## 快速开始

### 1. 安装与构建

```bash
npm install
npm run build
```

### 2. 启动 API + Web

```bash
npm run start:api
```

- Health: `http://localhost:8711/health`
- Console: `http://localhost:8711/`

### 3. CLI 本地扫描

```bash
npm start -- scan --target ./src --mode local
```

### 4. CLI API 模式

```bash
npm start -- scan --target ./src --mode api
npm start -- task --mode api
```

### 5. 修复执行（可选）

```bash
npm start -- fix --target ./src --mode local --apply
```

> 默认不会直接改代码，只有显式 `--apply` 才会执行受控 Git 动作。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 编译 TypeScript |
| `npm run test` | 运行测试 |
| `npm run test:coverage` | 覆盖率测试 |
| `npm run start:api` | 启动 API 与 Web |
| `npm run release:preflight` | 发布前一键自检 |

## 环境变量

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `CODEBOT_API_PORT` | API 端口 | `8711` |
| `CODEBOT_API_TOKEN` | 默认 admin token | `dev-token` |
| `CODEBOT_TASK_STORE_BACKEND` | 任务存储后端 | `file` |
| `CODEBOT_POSTGRES_URL` | Postgres 连接串 | 空 |
| `CODEBOT_GIT_PROTECTED_BRANCHES` | 受保护分支 | `main,master` |
| `CODEBOT_GIT_COMMIT_TEMPLATE` | 修复提交模板 | 内置模板 |
| `CODEBOT_LLM_PROVIDER` | LLM provider | `mock` |
| `CODEBOT_LLM_MODEL` | LLM model | `gpt-4o-mini` |
| `OPENAI_API_KEY` | OpenAI Key | 空 |

## 项目结构

```text
codebot/
├── src/
│   ├── main.ts
│   ├── api/
│   │   ├── server.ts
│   │   ├── auth.ts
│   │   ├── audit-log.ts
│   │   ├── task-queue.ts
│   │   ├── task-store.ts
│   │   └── stores/{file,sqlite,postgres}-task-store.ts
│   ├── core/engine.ts
│   ├── rules/registry.ts
│   ├── reporters/writers.ts
│   ├── automation/{pipeline.ts,git-workflow.ts}
│   ├── ai/providers.ts
│   ├── utils/{config.ts,types.ts,logger.ts}
│   └── web/index.html
├── tests/
├── docs/
├── CHANGELOG.md
├── config.yaml
├── docker-compose.yml
└── .env.example
```

## 文档

- [中文文档](README_CN.md)
- [English README](README_EN.md)
- [运行手册](docs/RUNBOOK.md)
- [发布检查清单](docs/RELEASE_CHECKLIST.md)
- [版本记录](CHANGELOG.md)

## 许可证

本项目建议使用 MIT 许可证（如需发布请补充 `LICENSE` 文件）。
