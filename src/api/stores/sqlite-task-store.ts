import fs from "node:fs";
import path from "node:path";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { TaskRecord } from "../../utils/types";
import { ITaskStore, TaskListQuery } from "../task-store.types";

export class SqliteTaskStore implements ITaskStore {
  private dbPath = "";
  private SQL?: SqlJsStatic;
  private db?: Database;

  constructor(private readonly dataDir: string) {}

  private get client(): Database {
    if (!this.db) throw new Error("SqliteTaskStore not initialized.");
    return this.db;
  }

  async init(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.dbPath = path.join(this.dataDir, "tasks.sqlite");
    this.SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const bytes = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(new Uint8Array(bytes));
    } else {
      this.db = new this.SQL.Database();
    }
    this.client.exec(`
      CREATE TABLE IF NOT EXISTS codebot_tasks (
        id TEXT PRIMARY KEY,
        target TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        result_json_path TEXT,
        error TEXT
      );
    `);
    this.flush();
  }

  private flush(): void {
    const bytes = this.client.export();
    fs.writeFileSync(this.dbPath, Buffer.from(bytes));
  }

  async create(task: TaskRecord): Promise<void> {
    this.client.run(
      `INSERT INTO codebot_tasks(id,target,mode,status,created_at,updated_at,result_json_path,error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.target,
        task.mode,
        task.status,
        task.createdAt,
        task.updatedAt,
        task.resultJsonPath ?? null,
        task.error ?? null
      ]
    );
    this.flush();
  }

  async update(task: TaskRecord): Promise<void> {
    this.client.run(
      `UPDATE codebot_tasks
       SET status=?, updated_at=?, result_json_path=?, error=?
       WHERE id=?`,
      [task.status, task.updatedAt, task.resultJsonPath ?? null, task.error ?? null, task.id]
    );
    this.flush();
  }

  async list(query?: TaskListQuery): Promise<TaskRecord[]> {
    const q = query ?? {};
    const where: string[] = [];
    const params: Array<string | number | null> = [];
    if (q.status) {
      where.push("status = ?");
      params.push(q.status);
    }
    if (q.mode) {
      where.push("mode = ?");
      params.push(q.mode);
    }
    if (Number.isFinite(q.createdAfter)) {
      where.push("created_at >= ?");
      params.push(Number(q.createdAfter));
    }
    const sortBy = q.sortBy === "updatedAt" ? "updated_at" : "created_at";
    const sortOrder = q.sortOrder === "asc" ? "ASC" : "DESC";
    const limit = Math.max(1, q.limit ?? 50);
    const offset = Math.max(0, q.offset ?? 0);
    const rows = this.query(
      `SELECT id,target,mode,status,created_at,updated_at,result_json_path,error
       FROM codebot_tasks
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return rows.map((r) => this.mapRow(r));
  }

  async count(query?: TaskListQuery): Promise<number> {
    const q = query ?? {};
    const where: string[] = [];
    const params: Array<string | number | null> = [];
    if (q.status) {
      where.push("status = ?");
      params.push(q.status);
    }
    if (q.mode) {
      where.push("mode = ?");
      params.push(q.mode);
    }
    if (Number.isFinite(q.createdAfter)) {
      where.push("created_at >= ?");
      params.push(Number(q.createdAfter));
    }
    const rows = this.query(
      `SELECT COUNT(*) as total FROM codebot_tasks ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`,
      params
    );
    return Number(rows[0]?.total ?? 0);
  }

  async getById(id: string): Promise<TaskRecord | undefined> {
    const rows = this.query(
      `SELECT id,target,mode,status,created_at,updated_at,result_json_path,error
       FROM codebot_tasks WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows.length ? this.mapRow(rows[0]) : undefined;
  }

  async purgeAll(): Promise<number> {
    const rows = this.query(`SELECT COUNT(*) as total FROM codebot_tasks`);
    const total = Number(rows[0]?.total ?? 0);
    this.client.run(`DELETE FROM codebot_tasks`);
    this.flush();
    return total;
  }

  private query(sql: string, params: Array<string | number | null> = []): any[] {
    const stmt = this.client.prepare(sql, params);
    const rows: any[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  private mapRow(row: any): TaskRecord {
    return {
      id: String(row.id),
      target: String(row.target),
      mode: row.mode === "fix" ? "fix" : "scan",
      status: row.status as TaskRecord["status"],
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      resultJsonPath: row.result_json_path == null ? undefined : String(row.result_json_path),
      error: row.error == null ? undefined : String(row.error)
    };
  }
}
