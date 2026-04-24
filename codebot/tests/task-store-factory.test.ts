import { describe, expect, it } from "vitest";
import { createTaskStore } from "../src/api/task-store";
import { AppConfig } from "../src/utils/config";

function baseConfig(): AppConfig {
  return {
    name: "codebot",
    workspace: ".",
    reportDir: ".",
    dataDir: ".",
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
    taskStoreBackend: "file",
    gitProtectedBranches: ["main", "master"],
    gitCommitTemplate: "chore(codebot): apply quality suggestions from automated scan"
  };
}

describe("task store factory", () => {
  it("builds file backend by default", () => {
    const store = createTaskStore(baseConfig());
    expect(store).toBeTruthy();
  });

  it("requires postgres url for postgres backend", () => {
    const cfg: AppConfig = { ...baseConfig(), taskStoreBackend: "postgres", postgresUrl: "" };
    expect(() => createTaskStore(cfg)).toThrow(/postgres_url/);
  });
});
