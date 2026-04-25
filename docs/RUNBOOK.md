# Codebot Runbook

## 1. Prerequisites

- Node.js >= 20
- npm >= 10

## 2. Local startup

```bash
npm install
npm run build
npm run start:api
```

Health check:

```bash
curl http://localhost:8711/health
```

## 3. Token and role

- Header: `x-codebot-token`
- Roles:
  - `admin`: full access
  - `operator`: create tasks
  - `viewer`: read-only endpoints

## 4. Common operations

Create scan task:

```bash
curl -X POST http://localhost:8711/api/tasks ^
  -H "content-type: application/json" ^
  -H "x-codebot-token: dev-token" ^
  -d "{\"target\":\"./src\",\"mode\":\"scan\"}"
```

Rotate token (admin):

```bash
curl -X POST http://localhost:8711/api/auth/rotate ^
  -H "content-type: application/json" ^
  -H "x-codebot-token: dev-token" ^
  -d "{\"role\":\"operator\"}"
```

## 5. Docker

```bash
docker compose up --build
```

## 6. Troubleshooting

- `401 AUTH_UNAUTHORIZED`: missing/invalid token.
- `403 AUTH_FORBIDDEN`: role permission denied.
- `500 STORE_UNAVAILABLE`: task store backend unavailable.
