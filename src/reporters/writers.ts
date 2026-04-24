import fs from "node:fs";
import path from "node:path";
import { AgentAnalysis, Finding, SessionEvent } from "../utils/types";

export function writeReports(params: {
  reportDir: string;
  sessionId: string;
  target: string;
  findings: Finding[];
  aiSummary: string;
  agentAnalysis?: AgentAnalysis;
  events: SessionEvent[];
  gitProposalPath?: string;
  repoMeta?: Record<string, unknown>;
}): { markdown: string; json: string; html: string } {
  fs.mkdirSync(params.reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${params.sessionId}-${stamp}`;
  const md = path.join(params.reportDir, `${base}.md`);
  const js = path.join(params.reportDir, `${base}.json`);
  const html = path.join(params.reportDir, `${base}.html`);

  const mdBody = [
    `# Codebot Report - ${params.sessionId}`,
    "",
    `- Target: \`${params.target}\``,
    `- Findings: **${params.findings.length}**`,
    `- Git Proposal: \`${params.gitProposalPath ?? "N/A"}\``,
    "",
    "## AI Summary",
    params.aiSummary,
    "",
    "## Agent Analysis",
    `- Provider: \`${params.agentAnalysis?.provider ?? "unknown"}\``,
    `- Model: \`${params.agentAnalysis?.model ?? "unknown"}\``,
    `- Readiness: **${params.agentAnalysis?.reviewer.readiness ?? "needs_changes"}**`,
    `- Release Gate: ${params.agentAnalysis?.reviewer.releaseGate ?? "N/A"}`,
    "",
    "### Planner",
    ...(params.agentAnalysis?.planner.executionPlan?.length
      ? params.agentAnalysis.planner.executionPlan.map((x) => `- ${x}`)
      : ["- N/A"]),
    "",
    "### Strategist",
    ...(params.agentAnalysis?.strategist.quickWins?.length
      ? params.agentAnalysis.strategist.quickWins.map((x) => `- ${x}`)
      : ["- N/A"]),
    "",
    "### Reviewer",
    ...(params.agentAnalysis?.reviewer.nextActions?.length
      ? params.agentAnalysis.reviewer.nextActions.map((x) => `- ${x}`)
      : ["- N/A"]),
    "",
    "### Executor",
    ...(params.agentAnalysis?.executor.executedTools?.length
      ? params.agentAnalysis.executor.executedTools.map(
          (t) => `- [${t.status}] \`${t.name}\` - ${t.summary}`
        )
      : ["- N/A"]),
    "",
    "### Self-Healing Gate",
    `- Auto Rescan Triggered: \`${params.agentAnalysis?.selfHealing.autoRescanTriggered ? "yes" : "no"}\``,
    `- Gate Decision: \`${params.agentAnalysis?.selfHealing.gateDecision ?? "conditional_pass"}\``,
    ...(params.agentAnalysis?.selfHealing.reasons?.length
      ? params.agentAnalysis.selfHealing.reasons.map((x) => `- Reason: ${x}`)
      : ["- Reason: N/A"]),
    `- Baseline: total=${params.agentAnalysis?.selfHealing.baseline.total ?? 0}, high=${params.agentAnalysis?.selfHealing.baseline.high ?? 0}, medium=${params.agentAnalysis?.selfHealing.baseline.medium ?? 0}, low=${params.agentAnalysis?.selfHealing.baseline.low ?? 0}`,
    `- Rescan: total=${params.agentAnalysis?.selfHealing.rescan?.total ?? "N/A"}, high=${params.agentAnalysis?.selfHealing.rescan?.high ?? "N/A"}, medium=${params.agentAnalysis?.selfHealing.rescan?.medium ?? "N/A"}, low=${params.agentAnalysis?.selfHealing.rescan?.low ?? "N/A"}`,
    `- Improvement: totalReduced=${params.agentAnalysis?.selfHealing.improvement?.totalReduced ?? "N/A"}, highReduced=${params.agentAnalysis?.selfHealing.improvement?.highReduced ?? "N/A"}, mediumReduced=${params.agentAnalysis?.selfHealing.improvement?.mediumReduced ?? "N/A"}, lowReduced=${params.agentAnalysis?.selfHealing.improvement?.lowReduced ?? "N/A"}`,
    "",
    "## Findings",
    ...(params.findings.length
      ? params.findings.flatMap((f) => [
          `- \`${f.severity.toUpperCase()}\` \`${f.ruleId}\` in \`${f.filePath}\``,
          `  - Message: ${f.message}`,
          `  - Suggestion: ${f.suggestion}`,
          `  - Patch: ${f.fix?.patchPreview ?? "manual review"} (confidence=${f.fix?.confidence ?? 0})`
        ])
      : ["- No findings in current rule set."])
  ].join("\n");

  fs.writeFileSync(md, mdBody, "utf8");
  fs.writeFileSync(
    js,
    JSON.stringify(
      {
        sessionId: params.sessionId,
        target: params.target,
        findingCount: params.findings.length,
        findings: params.findings,
        aiSummary: params.aiSummary,
        agentAnalysis: params.agentAnalysis,
        events: params.events,
        gitProposalPath: params.gitProposalPath,
        repoMeta: params.repoMeta
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    html,
    `<html><body><h1>Codebot Report</h1><p><b>Session:</b> ${params.sessionId}</p><p><b>Target:</b> ${params.target}</p><p><b>Findings:</b> ${params.findings.length}</p><p><b>Git Proposal:</b> ${params.gitProposalPath ?? "N/A"}</p><h2>AI Summary</h2><pre>${params.aiSummary}</pre><h2>Agent Readiness</h2><pre>${params.agentAnalysis?.reviewer.readiness ?? "needs_changes"} | ${params.agentAnalysis?.reviewer.releaseGate ?? ""}</pre></body></html>`,
    "utf8"
  );
  return { markdown: md, json: js, html };
}
