import fs from "node:fs";
import path from "node:path";
import { TaskRecord } from "../../utils/types";
import { ITaskStore, TaskListQuery } from "../task-store.types";

export class FileTaskStore implements ITaskStore {
  private dbPath = "";
  constructor(private readonly dataDir: string) {}

  async init(): Promise<void> {
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.dbPath = path.join(this.dataDir, "tasks.json");
    if (!fs.existsSync(this.dbPath)) fs.writeFileSync(this.dbPath, "[]", "utf8");
  }

  private readAll(): TaskRecord[] {
    if (!this.dbPath) throw new Error("FileTaskStore not initialized");
    return JSON.parse(fs.readFileSync(this.dbPath, "utf8")) as TaskRecord[];
  }

  private writeAll(rows: TaskRecord[]): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(rows, null, 2), "utf8");
  }

  async create(task: TaskRecord): Promise<void> {
    const all = this.readAll();
    all.push(task);
    this.writeAll(all);
  }

  async update(task: TaskRecord): Promise<void> {
    const all = this.readAll();
    const idx = all.findIndex((t) => t.id === task.id);
    if (idx >= 0) all[idx] = task;
    this.writeAll(all);
  }

  async list(query?: TaskListQuery): Promise<TaskRecord[]> {
    const q = query ?? {};
    let rows = this.readAll();
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.mode) rows = rows.filter((r) => r.mode === q.mode);
    if (Number.isFinite(q.createdAfter)) rows = rows.filter((r) => r.createdAt >= Number(q.createdAfter));
    const sortBy = q.sortBy ?? "createdAt";
    const sortOrder = q.sortOrder ?? "desc";
    rows = rows.sort((a, b) => {
      const delta = (a[sortBy] as number) - (b[sortBy] as number);
      return sortOrder === "asc" ? delta : -delta;
    });
    const offset = Math.max(0, q.offset ?? 0);
    const limit = Math.max(1, q.limit ?? rows.length);
    return rows.slice(offset, offset + limit);
  }

  async count(query?: TaskListQuery): Promise<number> {
    const q = query ?? {};
    let rows = this.readAll();
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.mode) rows = rows.filter((r) => r.mode === q.mode);
    if (Number.isFinite(q.createdAfter)) rows = rows.filter((r) => r.createdAt >= Number(q.createdAfter));
    return rows.length;
  }

  async getById(id: string): Promise<TaskRecord | undefined> {
    return this.readAll().find((t) => t.id === id);
  }

  async purgeAll(): Promise<number> {
    const rows = this.readAll();
    this.writeAll([]);
    return rows.length;
  }
}
