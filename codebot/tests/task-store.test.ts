import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileTaskStore } from "../src/api/stores/file-task-store";

describe("task store", () => {
  it("persists records", async () => {
    const dataDir = path.resolve(".tmp-data");
    fs.rmSync(dataDir, { recursive: true, force: true });
    const store = new FileTaskStore(dataDir);
    await store.init();
    await store.create({
      id: "t1",
      target: "repo",
      mode: "scan",
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    await store.create({
      id: "t2",
      target: "repo2",
      mode: "fix",
      status: "succeeded",
      createdAt: Date.now() + 1,
      updatedAt: Date.now() + 1
    });
    const rows = await store.list();
    expect(rows.length).toBe(2);
    const filtered = await store.list({ status: "succeeded", mode: "fix", limit: 10, offset: 0 });
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("t2");
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
