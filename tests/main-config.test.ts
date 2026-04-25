import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

describe("main config command", () => {
  it("prints effective config with masked secrets", () => {
    const entry = path.resolve("dist/src/main.js");
    const result = spawnSync("node", [entry, "config", "--config", "config.yaml"], {
      encoding: "utf8"
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"taskStoreBackend"');
    expect(result.stdout).toContain("***masked***");
  });
});
