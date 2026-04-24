import fs from "node:fs";
import path from "node:path";
import { Finding, SessionEvent } from "../utils/types";

export function writeReports(params: {
  reportDir: string;
  sessionId: string;
  target: string;
  findings: Finding[];
  aiSummary: string;
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
    `<html><body><h1>Codebot Report</h1><p><b>Session:</b> ${params.sessionId}</p><p><b>Target:</b> ${params.target}</p><p><b>Findings:</b> ${params.findings.length}</p><p><b>Git Proposal:</b> ${params.gitProposalPath ?? "N/A"}</p><h2>AI Summary</h2><pre>${params.aiSummary}</pre></body></html>`,
    "utf8"
  );
  return { markdown: md, json: js, html };
}
