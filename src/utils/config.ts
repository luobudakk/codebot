import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export interface AppConfig {
  name: string;
  workspace: string;
  reportDir: string;
  dataDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
  includeExtensions: string[];
  maxFiles: number;
  maxFileSizeKb: number;
  rules: Array<{
    id: string;
    enabled: boolean;
    languages: string[];
    severity: "high" | "medium" | "low";
    message: string;
    suggestion: string;
    pattern: string;
  }>;
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string;
  apiPort: number;
  apiToken: string;
  apiTokens: Array<{ token: string; role: "admin" | "operator" | "viewer" }>;
  taskStoreBackend: "file" | "sqlite" | "postgres";
  postgresUrl?: string;
  gitProtectedBranches: string[];
  gitCommitTemplate: string;
}

export function loadConfig(configPath: string): AppConfig {
  const raw = yaml.load(fs.readFileSync(configPath, "utf8")) as Record<string, any>;
  const app = raw?.app ?? {};
  const analysis = raw?.analysis ?? {};
  const llm = raw?.llm ?? {};
  const api = raw?.api ?? {};
  const rules = Array.isArray(raw?.rules) ? raw.rules : [];
  const maxFiles = Number(analysis.max_files ?? 500);
  const maxSize = Number(analysis.max_file_size_kb ?? 256);
  if (!Number.isFinite(maxFiles) || maxFiles <= 0) {
    throw new Error("Invalid config: analysis.max_files must be positive");
  }
  if (!Number.isFinite(maxSize) || maxSize <= 0) {
    throw new Error("Invalid config: analysis.max_file_size_kb must be positive");
  }
  const apiTokensRaw = Array.isArray(api.tokens) ? api.tokens : [];
  const parsedTokens = apiTokensRaw
    .map((it: any) => ({
      token: String(it?.token ?? ""),
      role: (it?.role ?? "viewer") as "admin" | "operator" | "viewer"
    }))
    .filter((it: { token: string }) => it.token.length > 0);
  if (parsedTokens.length === 0) {
    parsedTokens.push({
      token: String(process.env.CODEBOT_API_TOKEN ?? api.token ?? "dev-token"),
      role: "admin"
    });
  }
  return {
    name: app.name ?? "codebot",
    workspace: path.resolve(app.workspace ?? "./.codebot-workspace"),
    reportDir: path.resolve(app.report_dir ?? "./reports"),
    dataDir: path.resolve(app.data_dir ?? "./data"),
    logLevel: app.log_level ?? "info",
    includeExtensions: analysis.include_extensions ?? [".ts", ".tsx", ".js", ".py"],
    maxFiles,
    maxFileSizeKb: maxSize,
    rules,
    llmProvider: process.env.CODEBOT_LLM_PROVIDER ?? llm.provider ?? "mock",
    llmModel: process.env.CODEBOT_LLM_MODEL ?? llm.model ?? "gpt-4o-mini",
    llmBaseUrl: llm.base_url ?? "https://api.openai.com/v1",
    apiPort: Number(process.env.CODEBOT_API_PORT ?? api.port ?? 8711),
    apiToken: process.env.CODEBOT_API_TOKEN ?? api.token ?? "dev-token",
    apiTokens: parsedTokens,
    taskStoreBackend: (process.env.CODEBOT_TASK_STORE_BACKEND ??
      app.task_store_backend ??
      "file") as "file" | "sqlite" | "postgres",
    postgresUrl: process.env.CODEBOT_POSTGRES_URL ?? app.postgres_url,
    gitProtectedBranches: (
      process.env.CODEBOT_GIT_PROTECTED_BRANCHES ??
      app.git_protected_branches ??
      "main,master"
    )
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
    gitCommitTemplate:
      process.env.CODEBOT_GIT_COMMIT_TEMPLATE ??
      app.git_commit_template ??
      "chore(codebot): apply quality suggestions from automated scan"
  };
}
