import fs from "node:fs";
import path from "node:path";

export interface AuditEvent {
  ts: number;
  actorRole: string;
  action: string;
  resource: string;
  status: "ok" | "denied" | "error";
  detail?: Record<string, unknown>;
}

export interface AuditQuery {
  limit?: number;
  offset?: number;
  action?: string;
  status?: AuditEvent["status"];
  actorRole?: string;
}

export class AuditLogStore {
  private filePath = "";
  constructor(private readonly dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, "audit.log.jsonl");
  }

  append(event: AuditEvent): void {
    fs.appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, "utf8");
  }

  recent(limit = 200): AuditEvent[] {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs
      .readFileSync(this.filePath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    return lines
      .slice(-Math.max(1, limit))
      .map((line) => JSON.parse(line) as AuditEvent)
      .reverse();
  }

  query(q: AuditQuery): { items: AuditEvent[]; total: number } {
    const rows = this.recent(5000);
    let filtered = rows;
    if (q.action) filtered = filtered.filter((r) => r.action.includes(q.action!));
    if (q.status) filtered = filtered.filter((r) => r.status === q.status);
    if (q.actorRole) filtered = filtered.filter((r) => r.actorRole === q.actorRole);
    const total = filtered.length;
    const offset = Math.max(0, q.offset ?? 0);
    const limit = Math.max(1, q.limit ?? 100);
    return { items: filtered.slice(offset, offset + limit), total };
  }
}
