# Codebot English Documentation (Full)

[Main README](README.md) | [中文文档](README_CN.md)

Codebot is an AI-powered code quality inspection and assisted-fixing platform for engineering teams, with `CLI + API + Web Console` interfaces.

> Codebot is designed for legal and authorized software quality improvement workflows only. It does not provide penetration or unauthorized attack capabilities.

## Contents

- [Positioning](#positioning)
- [Feature Overview](#feature-overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [CLI Usage](#cli-usage)
- [API Usage](#api-usage)
- [Web Console](#web-console)
- [Reports and Artifacts](#reports-and-artifacts)
- [Rule System](#rule-system)
- [AI Provider](#ai-provider)
- [Git Auto-fix Strategy](#git-auto-fix-strategy)
- [Access Control and Audit](#access-control-and-audit)
- [Deployment](#deployment)
- [Development and Test](#development-and-test)
- [Project Structure](#project-structure)
- [FAQ](#faq)
- [Documentation Index](#documentation-index)

## Positioning

Codebot turns code quality checks from ad-hoc scripts into an operable platform capability:

- Standardized pipeline: prepare -> scan -> AI review -> report
- Controlled fixing flow: `dry-run` by default, explicit `--apply` required
- Platform governance: queue, RBAC, audit log, OpenAPI, Web console

## Feature Overview

### Quality Inspection

- Local path and Git repository targets
- Registry-based rules with config-driven enable/disable
- AI summary and fix suggestions
- Structured report export: `Markdown / JSON / HTML`

### Platform Features

- Async queue and task state machine
- Task pagination/filter/sort/detail APIs
- Historical report trend aggregation
- Pluggable stores: `file` / `sqlite(sql.js)` / `postgres`

### Governance

- Roles: `admin / operator / viewer`
- Token management and rotation
- Persistent audit trail with filters
- Unified API envelope and error model

## Architecture

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

## Quick Start

### Requirements

- Node.js `>= 20`
- npm `>= 10`
- Docker (optional)

### Install and Build

```bash
npm install
npm run build
```

### Start API and Web Console

```bash
npm run start:api
```

- Health: `http://localhost:8711/health`
- Web Console: `http://localhost:8711/`

### Run a Local Scan

```bash
npm run start -- scan --target ./src --mode local
```

## Configuration

Priority order: **environment variables > `config.yaml`**.

| Variable | Purpose | Default |
|----------|---------|---------|
| `CODEBOT_API_PORT` | API port | `8711` |
| `CODEBOT_API_TOKEN` | default admin token | `dev-token` |
| `CODEBOT_TASK_STORE_BACKEND` | store backend | `file` |
| `CODEBOT_POSTGRES_URL` | Postgres DSN | empty |
| `CODEBOT_GIT_PROTECTED_BRANCHES` | protected branches | `main,master` |
| `CODEBOT_GIT_COMMIT_TEMPLATE` | commit template | built-in |
| `CODEBOT_LLM_PROVIDER` | LLM provider | `mock` |
| `CODEBOT_LLM_MODEL` | model name | `gpt-4o-mini` |
| `OPENAI_API_KEY` | OpenAI-compatible key | empty |

## CLI Usage

```bash
# local scan
npm run start -- scan --target <path-or-git-url> --mode local

# submit tasks via API mode
npm run start -- scan --target <path-or-git-url> --mode api
npm run start -- task --mode api

# generate and apply fixes (optional)
npm run start -- fix --target <path-or-git-url> --mode local --apply

# print effective config
npm run start -- config
```

## API Usage

Default headers:

```text
Authorization: Bearer <token>
Content-Type: application/json
```

Key endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | health check |
| `GET` | `/api/openapi.json` | OpenAPI export |
| `GET` | `/api/me` | current role |
| `POST` | `/api/tasks` | create task (admin/operator) |
| `GET` | `/api/tasks` | list tasks |
| `GET` | `/api/tasks/:id` | task detail |
| `GET` | `/api/stats` | aggregated stats |
| `GET` | `/api/reports/history` | trend history |
| `GET` | `/api/auth/tokens` | token list (admin) |
| `POST` | `/api/auth/rotate` | rotate token (admin) |
| `GET` | `/api/audit/recent` | audit query (admin) |

## Web Console

The Web console includes:

- task creation and filtering
- paginated task list
- task detail and report viewer
- report statistics and trend chart
- admin token panel
- audit log query panel

## Reports and Artifacts

Typical outputs per run:

- `reports/*.md`
- `reports/*.json`
- `reports/*.html`
- `reports/*-git-proposal.json`

## Rule System

Rules are managed by a registry model. Built-in rules can be merged with custom rules from `config.yaml`, making team-level standardization easy.

## AI Provider

Current providers:

- `mock` (default)
- `openai_compat`

You can add custom providers in `src/ai/providers.ts`.

## Git Auto-fix Strategy

- proposal-first flow by default
- `--apply` executes controlled Git write actions
- protected branches and dirty tree safeguards are enforced

## Access Control and Audit

- RBAC model: `admin / operator / viewer`
- critical operations are persisted to audit log

## Deployment

### Local

```bash
npm install
npm run build
npm run start:api
```

### Docker Compose

```bash
docker compose up -d
```

## Development and Test

```bash
npm run build
npm run test
npm run test:coverage
npm run release:preflight
```

## Project Structure

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

## FAQ

### Why is no real LLM called?

Default provider is `mock`. Set `CODEBOT_LLM_PROVIDER=openai_compat` and `OPENAI_API_KEY` for real model calls.

### Why did `fix --apply` not execute?

Most common reasons: protected branch, dirty working tree, or non-git target.

### How do I switch to Postgres storage?

Set:

- `CODEBOT_TASK_STORE_BACKEND=postgres`
- `CODEBOT_POSTGRES_URL=postgres://...`

## Documentation Index

- [Main README](README.md)
- [中文文档](README_CN.md)
- [Runbook](docs/RUNBOOK.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Changelog](CHANGELOG.md)

## License

MIT is recommended. Add a `LICENSE` file before public release.
