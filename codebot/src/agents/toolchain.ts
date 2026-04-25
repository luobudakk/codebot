import { Finding } from "../utils/types";

export interface ToolExecutionResult {
  name: string;
  status: "ok" | "skipped" | "error";
  summary: string;
  output: Record<string, unknown>;
}

export interface ToolLayer {
  name: string;
  tools: string[];
}

export interface ToolCatalogItem {
  name: string;
  category: "quality" | "testing" | "release" | "architecture";
  description: string;
}

const TOOL_CATALOG: ToolCatalogItem[] = [
  { name: "rule_hotspot_profiler", category: "quality", description: "Find frequently-hit quality rules." },
  { name: "risk_cluster_analyzer", category: "quality", description: "Cluster risks by language and severity." },
  { name: "fix_queue_builder", category: "quality", description: "Prioritize suggested fixes." },
  { name: "dependency_risk_auditor", category: "quality", description: "Estimate third-party dependency risks." },
  { name: "complexity_hotspot_estimator", category: "architecture", description: "Estimate complexity hotspots by file path depth and findings." },
  { name: "regression_guard_planner", category: "testing", description: "Create regression safety checklist." },
  { name: "test_gap_analyzer", category: "testing", description: "Identify missing tests from findings and risk." },
  { name: "documentation_drift_checker", category: "release", description: "Detect documentation drift indicators." },
  { name: "release_narrative_writer", category: "release", description: "Generate release decision narrative." }
];

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

function buildRiskClusters(findings: Finding[]): ToolExecutionResult {
  const clusters = findings.reduce<Record<string, number>>((acc, f) => {
    const key = `${f.language}:${f.severity}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    name: "risk_cluster_analyzer",
    status: "ok",
    summary: "Risk clusters by language and severity generated.",
    output: { clusters: Object.entries(clusters).map(([key, count]) => ({ key, count })) }
  };
}

function buildReleaseNarrative(findings: Finding[]): ToolExecutionResult {
  const severity = countBySeverity(findings);
  const releaseNarrative =
    severity.high > 0
      ? "Block release until high-severity findings are fixed."
      : severity.medium > 0
      ? "Allow conditional release with explicit risk acceptance."
      : "Release can proceed with normal monitoring.";
  return {
    name: "release_narrative_writer",
    status: "ok",
    summary: "Release recommendation narrative generated.",
    output: { releaseNarrative, severity }
  };
}

function buildDependencyRiskAudit(findings: Finding[]): ToolExecutionResult {
  const suspicious = findings.filter((f) => /dependency|package|version|import/i.test(`${f.message} ${f.suggestion}`)).length;
  return {
    name: "dependency_risk_auditor",
    status: "ok",
    summary: "Dependency risk estimation completed.",
    output: { suspiciousDependencySignals: suspicious, recommendation: suspicious > 0 ? "Pin and audit risky dependencies." : "No clear dependency risk signal." }
  };
}

function buildComplexityHotspots(findings: Finding[]): ToolExecutionResult {
  const byPath: Record<string, number> = {};
  findings.forEach((f) => {
    const key = f.filePath.split(/[\\/]/).slice(0, 2).join("/") || f.filePath;
    byPath[key] = (byPath[key] || 0) + 1;
  });
  const hotspots = Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([pathKey, hits]) => ({ pathKey, hits }));
  return {
    name: "complexity_hotspot_estimator",
    status: "ok",
    summary: "Complexity hotspots estimated from finding density.",
    output: { hotspots }
  };
}

function buildTestGapAnalysis(findings: Finding[]): ToolExecutionResult {
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const suggestedCases = Math.max(1, high * 3 + medium);
  return {
    name: "test_gap_analyzer",
    status: "ok",
    summary: "Test gap analysis completed.",
    output: { suggestedCases, rationale: "Derived from medium/high finding volume." }
  };
}

function buildDocumentationDrift(findings: Finding[]): ToolExecutionResult {
  const driftSignals = findings.filter((f) => /comment|doc|readme|naming/i.test(`${f.message} ${f.suggestion}`)).length;
  return {
    name: "documentation_drift_checker",
    status: "ok",
    summary: "Documentation drift check completed.",
    output: { driftSignals, recommendation: driftSignals > 0 ? "Update README/spec comments with latest behavior." : "No significant documentation drift signal." }
  };
}

export function chooseTools(findings: Finding[]): string[] {
  const severity = countBySeverity(findings);
  const tools = ["rule_hotspot_profiler", "risk_cluster_analyzer", "fix_queue_builder", "complexity_hotspot_estimator"];
  if (severity.high > 0 || severity.medium > 0) {
    tools.push("regression_guard_planner", "test_gap_analyzer");
  }
  tools.push("dependency_risk_auditor", "documentation_drift_checker");
  tools.push("release_narrative_writer");
  return tools;
}

export function planToolLayers(selectedTools: string[]): ToolLayer[] {
  const layerA = selectedTools.filter((x) => ["rule_hotspot_profiler", "risk_cluster_analyzer", "complexity_hotspot_estimator"].includes(x));
  const layerB = selectedTools.filter((x) => ["fix_queue_builder", "regression_guard_planner", "test_gap_analyzer", "dependency_risk_auditor"].includes(x));
  const layerC = selectedTools.filter((x) => ["documentation_drift_checker", "release_narrative_writer"].includes(x));
  return [
    { name: "diagnose", tools: layerA },
    { name: "plan_fixes", tools: layerB },
    { name: "release_decision", tools: layerC }
  ].filter((l) => l.tools.length > 0);
}

export function getToolCatalog(): ToolCatalogItem[] {
  return TOOL_CATALOG.slice();
}

export function executeTools(selectedTools: string[], findings: Finding[]): ToolExecutionResult[] {
  return selectedTools.map((tool) => {
    try {
      if (tool === "rule_hotspot_profiler") return summarizeTopRules(findings);
      if (tool === "fix_queue_builder") return buildFixQueue(findings);
      if (tool === "regression_guard_planner") return buildRegressionChecklist(findings);
      if (tool === "risk_cluster_analyzer") return buildRiskClusters(findings);
      if (tool === "dependency_risk_auditor") return buildDependencyRiskAudit(findings);
      if (tool === "complexity_hotspot_estimator") return buildComplexityHotspots(findings);
      if (tool === "test_gap_analyzer") return buildTestGapAnalysis(findings);
      if (tool === "documentation_drift_checker") return buildDocumentationDrift(findings);
      if (tool === "release_narrative_writer") return buildReleaseNarrative(findings);
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
