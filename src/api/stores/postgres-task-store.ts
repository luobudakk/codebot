import { Client } from "pg";
import { TaskRecord } from "../../utils/types";
import { ITaskStore, TaskListQuery } from "../task-store.types";

export class PostgresTaskStore implements ITaskStore {
  private client: Client;
  private readonly maxRetries = 5;
  constructor(connectionString: string) {
    this.client = new Client({ connectionString });
  }

  async init(): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.client.connect();
        break;
      } catch (error) {
        lastError = error;
        if (attempt === this.maxRetries) {
          throw new Error(`Postgres connect failed after ${this.maxRetries} retries: ${String(lastError)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    }
    await this.runMigrations();
  }

  private async runMigrations(): Promise<void> {
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS codebot_tasks (
        id TEXT PRIMARY KEY,
        target TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        result_json_path TEXT,
        error TEXT
      );
    `);
    await this.client.query(`
      CREATE INDEX IF NOT EXISTS idx_codebot_tasks_status ON codebot_tasks(status);
    `);
    await this.client.query(`
      CREATE INDEX IF NOT EXISTS idx_codebot_tasks_created_at ON codebot_tasks(created_at DESC);
    `);
  }

  async create(task: TaskRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO codebot_tasks(id,target,mode,status,created_at,updated_at,result_json_path,error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
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
  }

  async update(task: TaskRecord): Promise<void> {
    await this.client.query(
      `UPDATE codebot_tasks SET status=$1, updated_at=$2, result_json_path=$3, error=$4 WHERE id=$5`,
      [task.status, task.updatedAt, task.resultJsonPath ?? null, task.error ?? null, task.id]
    );
  }

  async list(query?: TaskListQuery): Promise<TaskRecord[]> {
    const q = query ?? {};
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (q.status) {
      params.push(q.status);
      conditions.push(`status = $${params.length}`);
    }
    if (q.mode) {
      params.push(q.mode);
      conditions.push(`mode = $${params.length}`);
    }
    if (Number.isFinite(q.createdAfter)) {
      params.push(Number(q.createdAfter));
      conditions.push(`created_at >= $${params.length}`);
    }
    const sortBy = q.sortBy === "updatedAt" ? "updated_at" : "created_at";
    const sortOrder = q.sortOrder === "asc" ? "ASC" : "DESC";
    const limit = Math.max(1, q.limit ?? 50);
    const offset = Math.max(0, q.offset ?? 0);
    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;
    const rows = await this.client.query(
      `SELECT * FROM codebot_tasks
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    );
    return rows.rows.map((r) => this.mapRow(r));
  }

  async count(query?: TaskListQuery): Promise<number> {
    const q = query ?? {};
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (q.status) {
      params.push(q.status);
      conditions.push(`status = $${params.length}`);
    }
    if (q.mode) {
      params.push(q.mode);
      conditions.push(`mode = $${params.length}`);
    }
    if (Number.isFinite(q.createdAfter)) {
      params.push(Number(q.createdAfter));
      conditions.push(`created_at >= $${params.length}`);
    }
    const result = await this.client.query(
      `SELECT COUNT(*)::int AS total FROM codebot_tasks ${
        conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
      }`,
      params
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  async getById(id: string): Promise<TaskRecord | undefined> {
    const rows = await this.client.query(`SELECT * FROM codebot_tasks WHERE id=$1`, [id]);
    return rows.rows.length ? this.mapRow(rows.rows[0]) : undefined;
  }

  async purgeAll(): Promise<number> {
    const before = await this.client.query(`SELECT COUNT(*)::int AS total FROM codebot_tasks`);
    const total = Number(before.rows[0]?.total ?? 0);
    await this.client.query(`DELETE FROM codebot_tasks`);
    return total;
  }

  private mapRow(row: any): TaskRecord {
    return {
      id: row.id,
      target: row.target,
      mode: row.mode,
      status: row.status,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      resultJsonPath: row.result_json_path ?? undefined,
      error: row.error ?? undefined
    };
  }
}
