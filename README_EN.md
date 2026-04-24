# Codebot: AI-Powered Code Quality Automation Platform

Codebot is an engineering-focused quality automation platform with `CLI + API + Web Console`.  
It is built with a modular architecture, staged orchestration, provider abstraction, and structured outputs for practical software quality workflows.

## Features

### Core Capabilities

- **Rule Engine**: Configurable enable/disable, language scope, and severity levels
- **AI Evaluation**: Prioritized suggestions and fix guidance for findings
- **Structured Reports**: Export to `Markdown / JSON / HTML`
- **Trend Analysis**: Historical report aggregation and visualization
- **Controlled Fixing**: `dry-run` by default, explicit `--apply` required

### Platform Capabilities

- **Multi-surface UX**: CLI, REST API, and Web Console
- **Task Orchestration**: Async queue + state machine + querying
- **Pluggable Storage**: `file` / `sqlite` / `postgres`
- **Open API Surface**: `/api/openapi.json` export

### Governance & Security

- **RBAC**: `admin / operator / viewer`
- **Token Rotation**: Admin-managed rotating tokens
- **Audit Trail**: Persisted audit events with filtering/pagination
- **Unified Error Model**: Response envelope + standard error codes

## Requirements

- Node.js `>= 20`
- npm `>= 10`
- Docker (optional)

## Install & Run

```bash
npm install
npm run build
npm run start:api
```

Endpoints:

- Health: `http://localhost:8711/health`
- Web Console: `http://localhost:8711/`

## Quick Start

### Local scan mode

```bash
npm start -- scan --target ./src --mode local
```

### API mode submission

```bash
npm start -- scan --target ./src --mode api
npm start -- task --mode api
```

### Optional fix apply

```bash
npm start -- fix --target ./src --mode local --apply
```

## Common API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Service health |
| `GET /api/openapi.json` | OpenAPI export |
| `GET /api/me` | Current role |
| `POST /api/tasks` | Create task (admin/operator) |
| `GET /api/tasks` | Task list (pagination/filter) |
| `GET /api/stats` | Aggregated metrics |
| `GET /api/reports/history` | Report trend history |
| `GET /api/auth/tokens` | Token list (admin) |
| `POST /api/auth/rotate` | Rotate token (admin) |
| `GET /api/audit/recent` | Audit query (admin) |

## Docs

- [Main README](README.md)
- [中文文档](README_CN.md)
- [Runbook](docs/RUNBOOK.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Changelog](CHANGELOG.md)

## Disclaimer

Codebot does not provide penetration or unauthorized attack capabilities. Use it only in legal, authorized software engineering contexts.
