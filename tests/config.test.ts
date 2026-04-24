import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/utils/config";

describe("loadConfig", () => {
  it("loads and validates config", () => {
    const p = path.resolve(".tmp-config.yaml");
    fs.writeFileSync(
      p,
      "app:\n  name: x\nanalysis:\n  max_files: 10\n  max_file_size_kb: 12\nllm:\n  provider: mock\n",
      "utf8"
    );
    const cfg = loadConfig(p);
    expect(cfg.maxFiles).toBe(10);
    expect(cfg.name).toBe("x");
    fs.rmSync(p, { force: true });
  });
});
