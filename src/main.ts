import { loadConfig } from "./utils/config";
import { CodeQualityBotEngine } from "./core/engine";

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1];
}

function parseCommand(): string {
  return process.argv[2] ?? "scan";
}

function printEffectiveConfig(configPath: string): void {
  const config = loadConfig(configPath);
  console.log(
    JSON.stringify(
      {
        ...config,
        apiToken: config.apiToken ? "***masked***" : "",
        apiTokens: (config.apiTokens ?? []).map((t) => ({ role: t.role, token: "***masked***" })),
        postgresUrl: config.postgresUrl ? "***masked***" : ""
      },
      null,
      2
    )
  );
}

async function callApi(configPath: string, target: string, mode: "scan" | "fix"): Promise<void> {
  const cfg = loadConfig(configPath);
  const resp = await fetch(`http://localhost:${cfg.apiPort}/api/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-codebot-token": cfg.apiToken
    },
    body: JSON.stringify({ target, mode })
  });
  if (!resp.ok) throw new Error(`API submit failed: ${resp.status} ${await resp.text()}`);
  const task = await resp.json();
  console.log(`[codebot] submitted task=${task.id} status=${task.status}`);
}

async function localRun(configPath: string, target: string, applyGitProposal: boolean): Promise<void> {
  const config = loadConfig(configPath);
  const engine = new CodeQualityBotEngine(config);
  const result = await engine.run(target, { applyGitProposal });
  console.log(`[codebot] session=${result.sessionId}`);
  console.log(`[codebot] target=${result.targetPath}`);
  console.log(`[codebot] findings=${result.findingCount}`);
  console.log(`[codebot] report(md)=${result.markdownReport}`);
  console.log(`[codebot] report(json)=${result.jsonReport}`);
  console.log(`[codebot] report(html)=${result.htmlReport}`);
  if (result.gitProposalPath) console.log(`[codebot] git-proposal=${result.gitProposalPath}`);
}

async function listTasks(configPath: string): Promise<void> {
  const cfg = loadConfig(configPath);
  const resp = await fetch(`http://localhost:${cfg.apiPort}/api/tasks`, {
    headers: { "x-codebot-token": cfg.apiToken }
  });
  if (!resp.ok) throw new Error(`API task list failed: ${resp.status} ${await resp.text()}`);
  const rows = await resp.json();
  console.log(JSON.stringify(rows, null, 2));
}

async function main(): Promise<void> {
  const command = parseCommand();
  const target = parseArg("--target");
  const configPath = parseArg("--config") ?? "config.yaml";
  const mode = parseArg("--mode") === "api" ? "api" : "local";
  const apply = process.argv.includes("--apply");
  if (command === "config") {
    printEffectiveConfig(configPath);
    return;
  }
  if (command === "task") {
    await listTasks(configPath);
    return;
  }
  if (!target) {
    console.error(
      "Usage: npm run dev -- <scan|fix|task|config> --target <path-or-git-url> [--mode local|api] [--config config.yaml]"
    );
    process.exit(1);
  }
  if (mode === "api") {
    await callApi(configPath, target, command === "fix" ? "fix" : "scan");
    return;
  }
  await localRun(configPath, target, command === "fix" && apply);
}

main().catch((err) => {
  console.error("Codebot failed:", err);
  process.exit(1);
});
