import readline from "node:readline";
import { loadConfig } from "../utils/config";
import { listProviders } from "../ai/provider-registry";

async function fetchTasks(configPath: string): Promise<any[]> {
  const cfg = loadConfig(configPath);
  const resp = await fetch(`http://localhost:${cfg.apiPort}/api/tasks?limit=10&offset=0&sortBy=updatedAt&sortOrder=desc`, {
    headers: { "x-codebot-token": cfg.apiToken }
  });
  if (!resp.ok) throw new Error(`task api failed: ${resp.status} ${await resp.text()}`);
  const payload = await resp.json();
  return payload?.data?.items ?? [];
}

export async function runTerminalConsole(configPath: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  console.log("Codebot Terminal Console");
  console.log("commands: help, providers, tasks, watch, quit");
  for (;;) {
    const cmd = (await ask("codebot> ")).trim().toLowerCase();
    if (!cmd || cmd === "help") {
      console.log("help | providers | tasks | watch | quit");
      continue;
    }
    if (cmd === "quit" || cmd === "exit") {
      rl.close();
      return;
    }
    if (cmd === "providers") {
      console.log(JSON.stringify(listProviders(), null, 2));
      continue;
    }
    if (cmd === "tasks") {
      const rows = await fetchTasks(configPath);
      rows.forEach((r) => {
        console.log(`${String(r.id).slice(0, 8)}\t${r.status}\t${r.mode}\t${String(r.target).slice(0, 60)}`);
      });
      continue;
    }
    if (cmd === "watch") {
      console.log("watching tasks... (press Ctrl+C to stop)");
      // simple watch mode with Ctrl+C interrupt
      for (;;) {
        const rows = await fetchTasks(configPath);
        console.clear();
        console.log(`[watch ${new Date().toLocaleString()}]`);
        rows.forEach((r) => {
          console.log(`${String(r.id).slice(0, 8)}\t${r.status}\t${r.mode}\t${String(r.target).slice(0, 60)}`);
        });
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    console.log("unknown command. use: help");
  }
}
