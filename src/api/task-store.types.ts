import { TaskRecord } from "../utils/types";

export interface TaskListQuery {
  status?: TaskRecord["status"];
  mode?: TaskRecord["mode"];
  createdAfter?: number;
  offset?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}

export interface ITaskStore {
  init(): Promise<void>;
  create(task: TaskRecord): Promise<void>;
  update(task: TaskRecord): Promise<void>;
  list(query?: TaskListQuery): Promise<TaskRecord[]>;
  count(query?: TaskListQuery): Promise<number>;
  getById(id: string): Promise<TaskRecord | undefined>;
  purgeAll(): Promise<number>;
}
