import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanCodeQuality } from "../src/automation/pipeline";
import { mergeRules } from "../src/rules/registry";

describe("scanCodeQuality", () => {
  it("detects debug and bare catch patterns", () => {
    const root = path.resolve(".tmp-test");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, "sample.ts"),
      "function x(){ try { console.log('x'); } catch () { } }",
      "utf8"
    );
    const findings = scanCodeQuality(root, [".ts"], 10, 256, mergeRules(undefined));
    const ids = findings.map((f) => f.ruleId);
    expect(ids).toContain("EMPTY_CATCH_OR_BARE_EXCEPT");
    expect(ids).toContain("DEBUG_OUTPUT_LEFTOVER");
    fs.rmSync(root, { recursive: true, force: true });
  });
});
