import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createTaskStore } from "../src/api/task-store";
import { AppConfig } from "../src/utils/config";

function sqliteConfig(dataDir: string): AppConfig {
  return {
    name: "codebot",
    workspace: ".",
    reportDir: ".",
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
    apiToken: "t",
    apiTokens: [{ token: "t", role: "admin" }],
    taskStoreBackend: "sqlite",
    gitProtectedBranches: ["main", "master"],
    gitCommitTemplate: "chore(codebot): apply quality suggestions from automated scan"
  };
}

describe("sqlite task store", () => {
  it("persists task records with sql.js backend", async () => {
    const dataDir = path.resolve(".tmp-sqlite-store");
    fs.rmSync(dataDir, { recursive: true, force: true });
    const store = createTaskStore(sqliteConfig(dataDir));
    await store.init();
    await store.create({
      id: "sqlite-1",
      target: "repo",
      mode: "scan",
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    const task = await store.getById("sqlite-1");
    expect(task?.id).toBe("sqlite-1");
    const rows = await store.list();
    expect(rows.length).toBeGreaterThan(0);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
