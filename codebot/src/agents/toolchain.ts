import { Finding } from "../utils/types";

export interface ToolExecutionResult {
  name: string;
  status: "ok" | "skipped" | "error";
  summary: string;
  output: Record<string, unknown>;
}

function countBySeverity(findings: Finding[]): Record<string, number> {
  const map: Record<string, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    map[f.severity] = (map[f.severity] || 0) + 1;
  }
  return map;
}

function summarizeTopRules(findings: Finding[]): ToolExecutionResult {
  const byRule: Record<string, number> = {};
  for (const f of findings) {
    byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
  }
  const topRules = Object.entries(byRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([ruleId, hits]) => ({ ruleId, hits }));
  return {
    name: "rule_hotspot_profiler",
    status: "ok",
    summary: topRules.length ? "Top rule hotspots identified." : "No rule hotspots.",
    output: { topRules }
  };
}

function buildFixQueue(findings: Finding[]): ToolExecutionResult {
  const queue = findings
    .map((f) => ({
      ruleId: f.ruleId,
      filePath: f.filePath,
      severity: f.severity,
      confidence: f.fix?.confidence ?? 0,
      strategy: f.fix?.strategy ?? "manual"
    }))
    .sort((a, b) => {
      const sevScore = (s: string) => (s === "high" ? 3 : s === "medium" ? 2 : 1);
      return sevScore(b.severity) - sevScore(a.severity) || b.confidence - a.confidence;
    })
    .slice(0, 20);
  return {
    name: "fix_queue_builder",
    status: "ok",
    summary: queue.length ? "Prioritized fix queue generated." : "No fix queue items.",
    output: { queue }
  };
}

function buildRegressionChecklist(findings: Finding[]): ToolExecutionResult {
  const severity = countBySeverity(findings);
  const checklist = [
    "Run unit tests for modified modules.",
    "Run API integration smoke tests.",
    "Verify lints/build pass on CI."
  ];
  if (severity.high > 0) checklist.unshift("Add regression tests for all high-severity findings.");
  return {
    name: "regression_guard_planner",
    status: "ok",
    summary: "Regression checklist generated.",
    output: { checklist, severity }
  };
}

export function chooseTools(findings: Finding[]): string[] {
  const severity = countBySeverity(findings);
  const tools = ["rule_hotspot_profiler", "fix_queue_builder"];
  if (severity.high > 0 || severity.medium > 0) tools.push("regression_guard_planner");
  return tools;
}

export function executeTools(selectedTools: string[], findings: Finding[]): ToolExecutionResult[] {
  return selectedTools.map((tool) => {
    try {
      if (tool === "rule_hotspot_profiler") return summarizeTopRules(findings);
      if (tool === "fix_queue_builder") return buildFixQueue(findings);
      if (tool === "regression_guard_planner") return buildRegressionChecklist(findings);
      return {
        name: tool,
        status: "skipped",
        summary: "Tool not registered.",
        output: {}
      };
    } catch (error) {
      return {
        name: tool,
        status: "error",
        summary: error instanceof Error ? error.message : String(error),
        output: {}
      };
    }
  });
}
