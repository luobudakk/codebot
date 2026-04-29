import { randomUUID } from "node:crypto";
import { CodeQualityBotEngine } from "../core/engine";
import { TaskRecord } from "../utils/types";
import { ITaskStore } from "./task-store.types";

export class TaskQueue {
  private running = 0;
  private readonly waiting: Array<() => Promise<void>> = [];
  private readonly progressByTaskId = new Map<
    string,
    { phase: string; percent: number; message: string; updatedAt: number; done: boolean; ok?: boolean }
  >();

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
    this.setProgress(task.id, {
      phase: "queued",
      percent: 2,
      message: "任务已入队，等待执行",
      done: false
    });
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
      this.setProgress(task.id, {
        phase: "running",
        percent: 10,
        message: "开始执行任务，初始化扫描上下文",
        done: false
      });
      this.setProgress(task.id, {
        phase: "llm_check",
        percent: 25,
        message: "正在校验 AI 引擎连通性",
        done: false
      });
      this.setProgress(task.id, {
        phase: "analysis",
        percent: 45,
        message: "连通性通过，正在执行代码审阅与策略分析",
        done: false
      });
      const result = await this.engine.run(task.target);
      this.setProgress(task.id, {
        phase: "reporting",
        percent: 90,
        message: "分析完成，正在生成报告与结果索引",
        done: false
      });
      task.status = "succeeded";
      task.resultJsonPath = result.jsonReport;
      task.updatedAt = Date.now();
      await this.store.update(task);
      this.setProgress(task.id, {
        phase: "completed",
        percent: 100,
        message: "任务完成",
        done: true,
        ok: true
      });
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      task.updatedAt = Date.now();
      await this.store.update(task);
      this.setProgress(task.id, {
        phase: "failed",
        percent: 100,
        message: task.error ?? "任务失败",
        done: true,
        ok: false
      });
    }
  }

  getProgress(taskId: string): { phase: string; percent: number; message: string; updatedAt: number; done: boolean; ok?: boolean } | undefined {
    return this.progressByTaskId.get(taskId);
  }

  private setProgress(
    taskId: string,
    state: { phase: string; percent: number; message: string; done: boolean; ok?: boolean }
  ): void {
    this.progressByTaskId.set(taskId, {
      ...state,
      updatedAt: Date.now()
    });
  }
}
