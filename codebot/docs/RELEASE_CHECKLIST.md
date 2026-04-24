# Release Checklist (v1.1.0+)

## Pre-release

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] Verify `README.md`, `CHANGELOG.md`, `docs/RUNBOOK.md` updated
- [ ] Confirm `config.yaml` defaults are safe for public example
- [ ] Confirm no secrets committed (`.env`, tokens, credentials)

## Functional checks

- [ ] `GET /health` returns `ok=true`
- [ ] `GET /api/openapi.json` returns document payload
- [ ] Auth checks:
  - [ ] invalid token -> `AUTH_UNAUTHORIZED`
  - [ ] viewer create task -> `AUTH_FORBIDDEN`
  - [ ] admin create task -> success
- [ ] Audit checks:
  - [ ] denied action appears in `/api/audit/recent`
  - [ ] successful token rotation appears in audit logs
- [ ] Web console:
  - [ ] pagination works
  - [ ] task detail and report loading work
  - [ ] trend chart renders
  - [ ] token admin panel works with admin token

## Packaging & release

- [ ] Version is bumped in `package.json`
- [ ] Changelog includes this release
- [ ] Docker command verified:
  - [ ] `docker compose up --build`
- [ ] Create release tag and notes

## Post-release

- [ ] Smoke test in clean environment
- [ ] Check logs for auth/audit and task processing anomalies
