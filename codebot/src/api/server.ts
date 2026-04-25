import express from "express";
import fs from "node:fs";
import path from "node:path";
import { Express } from "express";
import { CodeQualityBotEngine } from "../core/engine";
import { loadConfig } from "../utils/config";
import { Logger } from "../utils/logger";
import { TaskQueue } from "./task-queue";
import { createTaskStore } from "./task-store";
import { TaskListQuery } from "./task-store.types";
import { AuthManager } from "./auth";
import { AuditLogStore } from "./audit-log";
import { readRuntimeLLMConfig, writeRuntimeLLMConfig } from "./llm-config-store";
import { listProviders } from "../ai/provider-registry";
import { getToolCatalog } from "../agents/toolchain";

function parseTaskListQuery(query: Record<string, unknown>): TaskListQuery {
  const status = typeof query.status === "string" ? query.status : undefined;
  const mode = typeof query.mode === "string" ? query.mode : undefined;
  const offset = Number(query.offset ?? 0);
  const limit = Number(query.limit ?? 50);
  const sortBy = query.sortBy === "updatedAt" ? "updatedAt" : "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
  return {
    status: status as TaskListQuery["status"],
    mode: mode as TaskListQuery["mode"],
    offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
    limit: Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50,
    sortBy,
    sortOrder
  };
}

function listReportJsonFiles(reportDir: string): string[] {
  if (!fs.existsSync(reportDir)) return [];
  return fs
    .readdirSync(reportDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(reportDir, name));
}

function ok<T>(res: any, data: T): void {
  res.json({ ok: true, data, error: null });
}

function fail(res: any, status: number, code: string, message: string): void {
  res.status(status).json({ ok: false, data: null, error: { code, message } });
}

function sanitizeUploadFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_");
}

interface UploadHistoryItem {
  id: string;
  filename: string;
  originalFilename?: string;
  size: number;
  createdAt: number;
  taskId: string;
  targetPath: string;
  actorRole: string;
}

function uploadHistoryPath(dataDir: string): string {
  return path.join(dataDir, "uploads.history.jsonl");
}

function appendUploadHistory(dataDir: string, item: UploadHistoryItem): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.appendFileSync(uploadHistoryPath(dataDir), `${JSON.stringify(item)}\n`, "utf8");
}

function queryUploadHistory(dataDir: string, limit: number, offset: number): { items: UploadHistoryItem[]; total: number } {
  const file = uploadHistoryPath(dataDir);
  if (!fs.existsSync(file)) return { items: [], total: 0 };
  const rows = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as UploadHistoryItem)
    .reverse();
  const total = rows.length;
  return { items: rows.slice(offset, offset + limit), total };
}

export async function createApp(config = loadConfig("config.yaml")): Promise<Express> {
  const logger = new Logger(config.logLevel);
  const auth = new AuthManager(config.dataDir, config.apiTokens);
  const audit = new AuditLogStore(config.dataDir);
  const store = createTaskStore(config);
  await store.init();
  const engine = new CodeQualityBotEngine(config);
  const runtimeLlm = readRuntimeLLMConfig(config.dataDir);
  if (runtimeLlm) {
    engine.updateLLM(runtimeLlm);
  }
  const queue = new TaskQueue(store, engine, 2);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    logger.info("api_request", { method: req.method, path: req.path });
    next();
  });

  app.use((req, res, next) => {
    if (req.path.startsWith("/health") || req.path === "/" || req.path === "/api/openapi.json") return next();
    const token = req.header("x-codebot-token");
    const role = auth.getRole(token);
    (req as any).actorRole = role;
    if (!role) {
      audit.append({
        ts: Date.now(),
        actorRole: "anonymous",
        action: `${req.method} ${req.path}`,
        resource: req.path,
        status: "denied"
      });
      fail(res, 401, "AUTH_UNAUTHORIZED", "unauthorized");
      return;
    }
    next();
  });

  app.get("/health", async (_req, res) => {
    try {
      await store.list();
      ok(res, { name: config.name, ts: Date.now(), taskStoreBackend: config.taskStoreBackend });
    } catch (error) {
      fail(res, 500, "STORE_UNAVAILABLE", error instanceof Error ? error.message : String(error));
    }
  });

  app.get("/api/me", (req, res) => {
    const llm = engine.getLLMStatus();
    ok(res, {
      role: (req as any).actorRole ?? "anonymous",
      llmProvider: llm.provider,
      llmModel: llm.model,
      llmBaseUrl: llm.baseUrl,
      llmReady: llm.hasApiKey
    });
  });

  app.get("/api/openapi.json", (_req, res) => {
    ok(res, {
      openapi: "3.0.0",
      info: { title: "Codebot API", version: "1.0.0" },
      paths: {
        "/health": { get: { summary: "Health check" } },
        "/api/me": { get: { summary: "Get current role" } },
        "/api/tasks": { get: { summary: "List tasks" }, post: { summary: "Create task (admin/operator)" } },
        "/api/tasks/{id}": { get: { summary: "Get task detail" } },
        "/api/stats": { get: { summary: "Get task/report stats" } },
        "/api/uploads": { post: { summary: "Upload .py/.pdf/.txt/.doc/.docx and create scan task (admin/operator)" } },
        "/api/uploads/history": { get: { summary: "List upload history (admin/operator/viewer)" } },
        "/api/reports/{taskId}": { get: { summary: "Get report by task" } },
        "/api/reports/history": { get: { summary: "Get report trend history" } },
        "/api/llm/config": { get: { summary: "Get runtime llm config" }, post: { summary: "Update runtime llm config (admin)" } },
        "/api/llm/providers": { get: { summary: "List supported llm providers" } },
        "/api/tools/catalog": { get: { summary: "List executor tool catalog" } },
        "/api/llm/test": { post: { summary: "Test runtime llm connectivity (admin/operator)" } },
        "/api/auth/tokens": { get: { summary: "List masked tokens (admin)" } },
        "/api/auth/rotate": { post: { summary: "Rotate token (admin)" } },
        "/api/audit/recent": { get: { summary: "Query audit logs (admin)" } }
      }
    });
  });

  app.post("/api/tasks", async (req, res) => {
    const role = (req as any).actorRole as string;
    if (!["admin", "operator"].includes(role)) return fail(res, 403, "AUTH_FORBIDDEN", "forbidden");
    const target = String(req.body?.target ?? "").trim();
    const mode = req.body?.mode === "fix" ? "fix" : "scan";
    if (!target) return fail(res, 400, "VALIDATION_TARGET_REQUIRED", "target is required");
    const task = await queue.enqueue(target, mode);
    audit.append({ ts: Date.now(), actorRole: role, action: "create_task", resource: "/api/tasks", status: "ok" });
    ok(res, task);
  });

  app.post("/api/uploads", async (req, res) => {
    const role = (req as any).actorRole as string;
    if (!["admin", "operator"].includes(role)) return fail(res, 403, "AUTH_FORBIDDEN", "forbidden");
    const filename = String(req.body?.filename ?? "").trim();
    const contentBase64 = String(req.body?.contentBase64 ?? "").trim();
    if (!filename || !contentBase64) {
      return fail(res, 400, "VALIDATION_UPLOAD_REQUIRED", "filename and contentBase64 are required");
    }
    const ext = path.extname(filename).toLowerCase();
    if (![".py", ".pdf", ".txt", ".doc", ".docx"].includes(ext)) {
      return fail(res, 400, "VALIDATION_UPLOAD_TYPE", "only .py, .pdf, .txt, .doc, .docx are supported");
    }
    const binary = Buffer.from(contentBase64, "base64");
    if (binary.length === 0) {
      return fail(res, 400, "VALIDATION_UPLOAD_EMPTY", "upload content is empty");
    }
    if (binary.length > 10 * 1024 * 1024) {
      return fail(res, 400, "VALIDATION_UPLOAD_TOO_LARGE", "upload file must be <= 10MB");
    }
    const uploadDir = path.join(config.dataDir, "uploads");
    fs.mkdirSync(uploadDir, { recursive: true });
    const safeName = sanitizeUploadFileName(path.basename(filename));
    const targetPath = path.join(uploadDir, `${Date.now()}-${safeName}`);
    fs.writeFileSync(targetPath, binary);
    const task = await queue.enqueue(targetPath, "scan");
    appendUploadHistory(config.dataDir, {
      id: `up-${Math.random().toString(36).slice(2, 10)}`,
      filename: safeName,
      originalFilename: filename,
      size: binary.length,
      createdAt: Date.now(),
      taskId: task.id,
      targetPath,
      actorRole: role
    });
    audit.append({ ts: Date.now(), actorRole: role, action: "upload_scan_file", resource: "/api/uploads", status: "ok" });
    ok(res, { task, targetPath });
  });

  app.get("/api/uploads/history", (req, res) => {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 20)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    ok(res, queryUploadHistory(config.dataDir, limit, offset));
  });

  app.get("/api/llm/config", (req, res) => {
    ok(res, engine.getLLMStatus());
  });
  app.get("/api/llm/providers", (_req, res) => {
    ok(res, listProviders());
  });
  app.get("/api/tools/catalog", (_req, res) => {
    ok(res, getToolCatalog());
  });

  app.post("/api/llm/config", (req, res) => {
    const role = (req as any).actorRole as string;
    if (role !== "admin") return fail(res, 403, "AUTH_FORBIDDEN", "forbidden");
    const provider = String(req.body?.provider ?? "").trim();
    const model = String(req.body?.model ?? "").trim();
    const baseUrl = String(req.body?.baseUrl ?? "").trim();
    const apiKey = String(req.body?.apiKey ?? "").trim();
    if (!provider || !model) return fail(res, 400, "VALIDATION_LLM_REQUIRED", "provider and model are required");
    const next = { provider, model, baseUrl, apiKey };
    engine.updateLLM(next);
    writeRuntimeLLMConfig(config.dataDir, next);
    audit.append({ ts: Date.now(), actorRole: role, action: "update_llm_config", resource: "/api/llm/config", status: "ok" });
    ok(res, engine.getLLMStatus());
  });

  app.post("/api/llm/test", async (req, res) => {
    const role = (req as any).actorRole as string;
    if (!["admin", "operator"].includes(role)) return fail(res, 403, "AUTH_FORBIDDEN", "forbidden");
    const result = await engine.testLLMConnection();
    ok(res, result);
  });

  app.get("/api/tasks", async (req, res) => {
    const query = parseTaskListQuery(req.query as Record<string, unknown>);
    const [rows, total] = await Promise.all([store.list(query), store.count(query)]);
    ok(res, { items: rows, total, offset: query.offset ?? 0, limit: query.limit ?? 50 });
  });

  app.get("/api/tasks/:id", async (req, res) => {
    const task = await store.getById(req.params.id);
    if (!task) return fail(res, 404, "TASK_NOT_FOUND", "task not found");
    ok(res, task);
  });

  app.get("/api/auth/tokens", (req, res) => {
    if ((req as any).actorRole !== "admin") return fail(res, 403, "AUTH_FORBIDDEN", "forbidden");
    ok(res, auth.list());
  });

  app.post("/api/auth/rotate", (req, res) => {
    const role = (req as any).actorRole as string;
    if (role !== "admin") return fail(res, 403, "AUTH_FORBIDDEN", "forbidden");
    const targetRole = req.body?.role === "viewer" ? "viewer" : req.body?.role === "operator" ? "operator" : "admin";
    const token = auth.rotate(targetRole);
    audit.append({ ts: Date.now(), actorRole: role, action: "rotate_token", resource: "/api/auth/rotate", status: "ok" });
    ok(res, { role: token.role, token: token.token });
  });

  app.get("/api/stats", async (_req, res) => {
    const [queued, running, succeeded, failed, cancelled] = await Promise.all([
      store.count({ status: "queued" }),
      store.count({ status: "running" }),
      store.count({ status: "succeeded" }),
      store.count({ status: "failed" }),
      store.count({ status: "cancelled" })
    ]);
    const reportFiles = listReportJsonFiles(config.reportDir);
    ok(res, { tasks: { queued, running, succeeded, failed, cancelled }, reports: { count: reportFiles.length } });
  });

  app.get("/api/reports/history", (_req, res) => {
    const rows = listReportJsonFiles(config.reportDir).map((reportPath) => {
      const raw = JSON.parse(fs.readFileSync(reportPath, "utf8")) as any;
      return { sessionId: String(raw.sessionId ?? ""), target: String(raw.target ?? ""), findingCount: Number(raw.findingCount ?? 0) };
    });
    ok(res, rows);
  });

  app.get("/api/reports/:taskId", async (req, res) => {
    const task = await store.getById(req.params.taskId);
    if (!task?.resultJsonPath || !fs.existsSync(task.resultJsonPath)) return fail(res, 404, "REPORT_NOT_FOUND", "report not found");
    ok(res, JSON.parse(fs.readFileSync(task.resultJsonPath, "utf8")));
  });

  app.get("/api/audit/recent", (req, res) => {
    if ((req as any).actorRole !== "admin") return fail(res, 403, "AUTH_FORBIDDEN", "forbidden");
    const limit = Math.max(1, Math.min(500, Number(req.query.limit ?? 100)));
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const actorRole = typeof req.query.actorRole === "string" ? req.query.actorRole : undefined;
    ok(res, audit.query({ limit, offset, action, status: status as any, actorRole }));
  });

  app.get("/", (_req, res) => {
    res.type("text/html").send(fs.readFileSync(path.resolve("src/web/index.html"), "utf8"));
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    fail(res, 500, "INTERNAL_ERROR", err instanceof Error ? err.message : String(err));
  });

  return app;
}

async function bootstrap(): Promise<void> {
  const config = loadConfig("config.yaml");
  const app = await createApp(config);
  app.listen(config.apiPort, () => {
    console.log(`Codebot API on http://localhost:${config.apiPort}`);
  });
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error("Failed to start api:", err);
    process.exit(1);
  });
}
