import { describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import { createApp } from "../src/api/server";
import { AppConfig } from "../src/utils/config";

function cfg(dataDir: string): AppConfig {
  return {
    name: "codebot",
    workspace: ".",
    reportDir: path.resolve("reports"),
    dataDir,
    logLevel: "info",
    includeExtensions: [".ts"],
    maxFiles: 10,
    maxFileSizeKb: 10,
    rules: [],
    llmProvider: "mock",
    llmModel: "x",
    llmBaseUrl: "x",
    apiPort: 8711,
    apiToken: "admin-token",
    apiTokens: [
      { token: "admin-token", role: "admin" },
      { token: "viewer-token", role: "viewer" }
    ],
    taskStoreBackend: "file",
    gitProtectedBranches: ["main", "master"],
    gitCommitTemplate: "chore(codebot): apply quality suggestions from automated scan"
  };
}

describe("api integration", () => {
  it("enforces auth and role for task creation", async () => {
    const dataDir = path.resolve(".tmp-api-int");
    fs.rmSync(dataDir, { recursive: true, force: true });
    const app = await createApp(cfg(dataDir));

    const unauth = await request(app).post("/api/tasks").send({ target: "./src", mode: "scan" });
    expect(unauth.status).toBe(401);
    expect(unauth.body.error.code).toBe("AUTH_UNAUTHORIZED");

    const forbidden = await request(app)
      .post("/api/tasks")
      .set("x-codebot-token", "viewer-token")
      .send({ target: "./src", mode: "scan" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("AUTH_FORBIDDEN");

    const created = await request(app)
      .post("/api/tasks")
      .set("x-codebot-token", "admin-token")
      .send({ target: "./src", mode: "scan" });
    expect(created.status).toBe(200);
    expect(created.body.ok).toBe(true);

    const audit = await request(app).get("/api/audit/recent").set("x-codebot-token", "admin-token");
    expect(audit.status).toBe(200);
    expect(audit.body.ok).toBe(true);
    expect(Array.isArray(audit.body.data.items)).toBe(true);

    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
