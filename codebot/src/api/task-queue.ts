import { randomUUID } from "node:crypto";
import { CodeQualityBotEngine } from "../core/engine";
import { TaskRecord } from "../utils/types";
import { ITaskStore } from "./task-store.types";

export class TaskQueue {
  private running = 0;
  private readonly waiting: Array<() => Promise<void>> = [];

  constructor(
    private readonly store: ITaskStore,
    private readonly engine: CodeQualityBotEngine,
    private readonly concurrency = 2
  ) {}

  async enqueue(target: string, mode: "scan" | "fix"): Promise<TaskRecord> {
    const task: TaskRecord = {
      id: randomUUID(),
      target,
      mode,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await this.store.create(task);
    this.waiting.push(async () => this.execute(task));
    void this.pump();
    return task;
  }

  private async pump(): Promise<void> {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (!next) continue;
      this.running += 1;
      void next().finally(() => {
        this.running -= 1;
        void this.pump();
      });
    }
  }

  private async execute(task: TaskRecord): Promise<void> {
    try {
      task.status = "running";
      task.updatedAt = Date.now();
      await this.store.update(task);
      const result = await this.engine.run(task.target);
      task.status = "succeeded";
      task.resultJsonPath = result.jsonReport;
      task.updatedAt = Date.now();
      await this.store.update(task);
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      task.updatedAt = Date.now();
      await this.store.update(task);
    }
  }
}
