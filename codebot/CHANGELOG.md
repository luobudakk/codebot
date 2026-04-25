# Changelog

## v1.1.0

- Upgrade architecture to production-ready `CLI + API + Web` workflow.
- Add pluggable task store backends: `file`, `sqlite (sql.js)`, `postgres`.
- Add role-based auth (`admin/operator/viewer`), token rotation, and audit logging.
- Add task pagination/filtering/sorting and aggregated stats endpoints.
- Add report history/trend API and Web chart visualization.
- Add optional `fix --apply` Git execution with safety guards.
- Add OpenAPI export endpoint and integration tests for auth/audit flow.
