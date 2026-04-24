export type Severity = "high" | "medium" | "low";

export interface Finding {
  filePath: string;
  ruleId: string;
  language: string;
  severity: Severity;
  message: string;
  suggestion: string;
  fix?: FixSuggestion;
}

export interface RuleDefinition {
  id: string;
  enabled: boolean;
  languages: string[];
  severity: Severity;
  message: string;
  suggestion: string;
  pattern: string;
}

export interface RuleMatchContext {
  filePath: string;
  language: string;
  content: string;
}

export interface FixSuggestion {
  strategy: "manual" | "search_replace";
  confidence: number;
  patchPreview: string;
  rollbackHint: string;
}

export interface ProposedChange {
  filePath: string;
  beforeSnippet: string;
  afterSnippet: string;
}

export interface GitProposal {
  repository: string;
  branchName: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  changes: ProposedChange[];
  dryRun: boolean;
  metadata: Record<string, unknown>;
}

export interface SessionEvent {
  stage: string;
  details: Record<string, unknown>;
  ts: number;
}

export interface SessionRecord {
  sessionId: string;
  target: string;
  createdAt: number;
  events: SessionEvent[];
}

export interface RunResult {
  sessionId: string;
  targetPath: string;
  markdownReport: string;
  jsonReport: string;
  htmlReport: string;
  findingCount: number;
  gitProposalPath?: string;
}

export interface TaskRecord {
  id: string;
  target: string;
  mode: "scan" | "fix";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: number;
  updatedAt: number;
  resultJsonPath?: string;
  error?: string;
}
