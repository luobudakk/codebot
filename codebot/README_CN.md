# Codebot：AI 驱动的自动化代码质量平台

Codebot 是一个面向研发团队的智能代码质量巡检与辅助修复平台，提供 `CLI + API + Web Console` 三种工作方式。  
它采用模块化、多阶段编排、可扩展 provider 与结构化输出架构，聚焦代码质量治理场景。

## 功能特性

### 核心能力

- **规则引擎**：配置化规则启停、语言范围、严重级别
- **AI 分析**：对发现项生成优先级建议与修复提示
- **报告输出**：统一导出 `Markdown / JSON / HTML`
- **趋势分析**：历史报告聚合与可视化趋势
- **可控修复**：默认 dry-run，显式 `--apply` 才执行 Git 变更

### 平台能力

- **多端体验**：CLI、REST API、Web 控制台
- **任务编排**：异步队列 + 状态机 + 任务查询
- **存储可插拔**：`file` / `sqlite` / `postgres`
- **开放能力**：`/api/openapi.json` 文档导出

### 权限与治理

- **角色鉴权**：`admin / operator / viewer`
- **Token 轮换**：管理员可动态轮换凭证
- **审计日志**：关键操作持久化，支持过滤与分页查询
- **统一错误码**：API 响应 envelope 与标准错误码

## 系统要求

- Node.js `>= 20`
- npm `>= 10`
- Docker（可选）

## 安装与启动

```bash
npm install
npm run build
npm run start:api
```

访问：

- Health: `http://localhost:8711/health`
- Web: `http://localhost:8711/`

## 快速上手

### 本地模式扫描

```bash
npm start -- scan --target ./src --mode local
```

### API 模式提交任务

```bash
npm start -- scan --target ./src --mode api
npm start -- task --mode api
```

### 可选修复执行

```bash
npm start -- fix --target ./src --mode local --apply
```

## 常用接口

| 接口 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /api/openapi.json` | OpenAPI 文档导出 |
| `GET /api/me` | 当前角色 |
| `POST /api/tasks` | 创建任务（admin/operator） |
| `GET /api/tasks` | 任务列表（分页/筛选） |
| `GET /api/stats` | 聚合统计 |
| `GET /api/reports/history` | 报告趋势 |
| `GET /api/auth/tokens` | token 列表（admin） |
| `POST /api/auth/rotate` | token 轮换（admin） |
| `GET /api/audit/recent` | 审计查询（admin） |

## 文档与发布

- [主 README](README.md)
- [English](README_EN.md)
- [运行手册](docs/RUNBOOK.md)
- [发布检查清单](docs/RELEASE_CHECKLIST.md)
- [变更日志](CHANGELOG.md)

## 免责声明

本项目不提供任何渗透测试或未授权攻击能力；请在合法、合规、授权的前提下使用。
