import fs from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import { Finding, SessionRecord } from "../utils/types";
import { RuleDefinition } from "../utils/types";
import { runRuleRegistry } from "../rules/registry";

export class SessionManager {
  private readonly sessions = new Map<string, SessionRecord>();

  create(target: string): SessionRecord {
    const sessionId = `sess-${Math.random().toString(36).slice(2, 10)}`;
    const session: SessionRecord = { sessionId, target, createdAt: Date.now(), events: [] };
    this.sessions.set(sessionId, session);
    return session;
  }

  addEvent(sessionId: string, stage: string, details: Record<string, unknown>): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.events.push({ stage, details, ts: Date.now() });
  }
}

export async function prepareTarget(target: string, workspace: string): Promise<string> {
  fs.mkdirSync(workspace, { recursive: true });
  if (/^https?:\/\//.test(target) || target.endsWith(".git")) {
    const dest = path.join(workspace, `repo-${Date.now()}`);
    await simpleGit().clone(target, dest, ["--depth", "1"]);
    return dest;
  }
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) {
    throw new Error(`target does not exist: ${target}`);
  }
  return fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
}

function walkFiles(root: string, exts: string[], out: string[]): void {
  for (const name of fs.readdirSync(root)) {
    const abs = path.join(root, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      if (["node_modules", ".git", "dist", "build"].includes(name)) continue;
      walkFiles(abs, exts, out);
      continue;
    }
    if (exts.includes(path.extname(name))) out.push(abs);
  }
}

export function scanCodeQuality(
  repoDir: string,
  includeExtensions: string[],
  maxFiles: number,
  maxFileSizeKb: number,
  rules: RuleDefinition[]
): Finding[] {
  const files: string[] = [];
  walkFiles(repoDir, includeExtensions, files);
  const findings: Finding[] = [];
  for (const abs of files.slice(0, maxFiles)) {
    const stat = fs.statSync(abs);
    if (stat.size > maxFileSizeKb * 1024) continue;
    const text = fs.readFileSync(abs, "utf8");
    const rel = path.relative(repoDir, abs);
    findings.push(...runRuleRegistry(rel, text, rules));
  }
  return findings;
}
