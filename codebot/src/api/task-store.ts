import { AppConfig } from "../utils/config";
import { ITaskStore } from "./task-store.types";
import { FileTaskStore } from "./stores/file-task-store";
import { PostgresTaskStore } from "./stores/postgres-task-store";
import { SqliteTaskStore } from "./stores/sqlite-task-store";

export function createTaskStore(config: AppConfig): ITaskStore {
  const backend = config.taskStoreBackend;
  if (backend === "postgres") {
    if (!config.postgresUrl) {
      throw new Error("task_store_backend=postgres requires postgres_url");
    }
    return new PostgresTaskStore(config.postgresUrl);
  }
  if (backend === "sqlite") {
    return new SqliteTaskStore(config.dataDir);
  }
  return new FileTaskStore(config.dataDir);
}
