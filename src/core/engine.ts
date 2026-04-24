import { createLLM } from "../ai/providers";
import { prepareTarget, scanCodeQuality, SessionManager } from "../automation/pipeline";
import {
  buildGitProposal,
  collectRepoMeta,
  executeGitProposal,
  writeGitProposal
} from "../automation/git-workflow";
import { writeReports } from "../reporters/writers";
import { AppConfig } from "../utils/config";
import { Logger } from "../utils/logger";
import { AgentAnalysis, RunResult } from "../utils/types";
import { mergeRules } from "../rules/registry";
import { chooseTools, executeTools } from "../agents/toolchain";

type ToolExecutionLike = { name: string; status: "ok" | "skipped" | "error"; summary: string; output: Record<string, unknown> };

function summarizeSeverity(findings: Array<{ severity: string }>): { total: number; high: number; medium: number; low: number } {
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  const low = findings.filter((f) => f.severity === "low").length;
  return { total: findings.length, high, medium, low };
}

function buildSelfHealingAssessment(
  findings: Array<{ severity: string }>,
  toolExecutions: ToolExecutionLike[],
  rescanFindings?: Array<{ severity: string }>
): {
  autoRescanTriggered: boolean;
  gateDecision: "pass" | "conditional_pass" | "fail";
  reasons: string[];
  autoActions: string[];
  baseline: { total: number; high: number; medium: number; low: number };
  rescan?: { total: number; high: number; medium: number; low: number };
  improvement?: { totalReduced: number; highReduced: number; mediumReduced: number; lowReduced: number };
} {
  const baseline = summarizeSeverity(findings);
  const high = baseline.high;
  const medium = baseline.medium;
  const toolErrors = toolExecutions.filter((x) => x.status === "error").length;
  const autoRescanTriggered = high > 0 || medium > 0;
  const rescan = rescanFindings ? summarizeSeverity(rescanFindings) : undefined;
  const improvement = rescan
    ? {
        totalReduced: baseline.total - rescan.total,
        highReduced: baseline.high - rescan.high,
        mediumReduced: baseline.medium - rescan.medium,
        lowReduced: baseline.low - rescan.low
      }
    : undefined;

  if (toolErrors > 0 || high > 0) {
    return {
      autoRescanTriggered,
      gateDecision: "fail",
      reasons: [
        ...(toolErrors > 0 ? [`${toolErrors} tool executions failed`] : []),
        ...(high > 0 ? [`${high} high-severity findings remain after execution`] : [])
      ],
      autoActions: ["Re-run toolchain with stricter strategy", "Block release and require manual review"],
      baseline,
      rescan,
      improvement
    };
  }
  if (medium > 0) {
    return {
      autoRescanTriggered,
      gateDecision: "conditional_pass",
      reasons: [`${medium} medium-severity findings remain`],
      autoActions: ["Schedule auto-rescan after applying quick wins", "Allow release only with risk acceptance"],
      baseline,
      rescan,
      improvement
    };
  }
  return {
    autoRescanTriggered,
    gateDecision: "pass",
    reasons: ["No medium/high findings remain", "Executor chain completed without errors"],
    autoActions: ["Mark release gate as passed", "Persist chain result for audit traceability"],
    baseline,
    rescan,
    improvement
  };
}

function extractJsonBlock(text: string): Record<string, any> | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asList(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.map((x) => String(x)).filter(Boolean);
}

function buildAgentAnalysis(
  provider: string,
  model: string,
  findings: Array<{ severity: string }>,
  rescanFindings: Array<{ severity: string }> | undefined,
  plannerRaw: string,
  strategistRaw: string,
  reviewerRaw: string,
  toolExecutions: Array<{ name: string; status: "ok" | "skipped" | "error"; summary: string; output: Record<string, unknown> }>
): AgentAnalysis {
  const p = extractJsonBlock(plannerRaw) ?? {};
  const s = extractJsonBlock(strategistRaw) ?? {};
  const r = extractJsonBlock(reviewerRaw) ?? {};
  const readiness = ["ready", "needs_changes", "blocked"].includes(String(r.readiness))
    ? (r.readiness as "ready" | "needs_changes" | "blocked")
    : "needs_changes";
  const selfHealing = buildSelfHealingAssessment(findings, toolExecutions, rescanFindings);
  const adjustedReadiness =
    selfHealing.gateDecision === "fail"
      ? "blocked"
      : selfHealing.gateDecision === "conditional_pass"
      ? "needs_changes"
      : readiness;
  const gatePrefix =
    selfHealing.gateDecision === "fail"
      ? "[SELF-HEAL FAIL]"
      : selfHealing.gateDecision === "conditional_pass"
      ? "[SELF-HEAL CONDITIONAL]"
      : "[SELF-HEAL PASS]";
  return {
    provider,
    model,
    planner: {
      objectives: asList(p.objectives, ["明确修复优先级并控制回归风险"]),
      prioritizedRisks: asList(p.prioritizedRisks, ["发现项信息不足，需补充上下文"]),
      executionPlan: asList(p.executionPlan, ["先修复高危规则命中项，再执行回归验证"])
    },
    strategist: {
      quickWins: asList(s.quickWins, ["清理高频低成本问题（日志、空捕获、重复代码）"]),
      deepFixes: asList(s.deepFixes, ["拆分大模块并补充边界校验"]),
      testPlan: asList(s.testPlan, ["补充关键路径单测与上传流程集成测试"])
    },
    reviewer: {
      readiness: adjustedReadiness,
      releaseGate: `${gatePrefix} ${String(r.releaseGate ?? "需要至少通过核心链路回归测试后再发布")}`,
      residualRisks: asList(r.residualRisks, ["仍存在未覆盖场景"]),
      nextActions: [...asList(r.nextActions, ["补齐测试并复跑扫描"]), ...selfHealing.autoActions]
    },
    executor: {
      selectedTools: toolExecutions.map((x) => x.name),
      executedTools: toolExecutions
    },
    selfHealing,
    raw: {
      planner: plannerRaw,
      strategist: strategistRaw,
      reviewer: reviewerRaw
    }
  };
}

export class CodeQualityBotEngine {
  // 复用原项目设计思想：可替换 LLM 工厂 + 会话管理 + 分阶段自动化执行
  private readonly sessionManager = new SessionManager();
  private llm;
  private readonly logger: Logger;
  private llmProvider: string;
  private llmModel: string;
  private llmBaseUrl: string;
  private llmApiKey = "";

  constructor(private readonly config: AppConfig) {
    this.llmProvider = config.llmProvider;
    this.llmModel = config.llmModel;
    this.llmBaseUrl = config.llmBaseUrl;
    this.llm = createLLM(this.llmProvider, this.llmModel, this.llmBaseUrl);
    this.logger = new Logger(config.logLevel);
  }

  getLLMStatus(): { provider: string; model: string; baseUrl: string; hasApiKey: boolean } {
    return {
      provider: this.llmProvider,
      model: this.llmModel,
      baseUrl: this.llmBaseUrl,
      hasApiKey: Boolean(this.llmApiKey || process.env.CODEBOT_LLM_API_KEY || process.env.OPENAI_API_KEY)
    };
  }

  updateLLM(config: { provider: string; model: string; baseUrl: string; apiKey?: string }): void {
    this.llmProvider = config.provider;
    this.llmModel = config.model;
    this.llmBaseUrl = config.baseUrl;
    this.llmApiKey = config.apiKey ?? "";
    this.llm = createLLM(this.llmProvider, this.llmModel, this.llmBaseUrl, this.llmApiKey);
    this.logger.info("llm_runtime_updated", {
      provider: this.llmProvider,
      model: this.llmModel,
      baseUrl: this.llmBaseUrl
    });
  }

  async testLLMConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const text = await this.llm.chat([
        { role: "system", content: "You are a health-check assistant. Reply with one short line." },
        { role: "user", content: "Return 'codebot llm ok'." }
      ]);
      return { ok: true, message: text.slice(0, 160) || "codebot llm ok" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async run(target: string, options?: { applyGitProposal?: boolean }): Promise<RunResult> {
    const session = this.sessionManager.create(target);
    const rules = mergeRules(this.config.rules);
    this.logger.info("engine_started", { target, sessionId: session.sessionId, rules: rules.length });
    this.sessionManager.addEvent(session.sessionId, "start", { target });

    const repoPath = await prepareTarget(target, this.config.workspace);
    this.sessionManager.addEvent(session.sessionId, "prepare_target", { resolvedPath: repoPath });

    const findings = await scanCodeQuality(
      repoPath,
      this.config.includeExtensions,
      this.config.maxFiles,
      this.config.maxFileSizeKb,
      rules
    );
    this.sessionManager.addEvent(session.sessionId, "static_scan", { findings: findings.length });
    const repoMeta = await collectRepoMeta(repoPath);
    this.sessionManager.addEvent(session.sessionId, "repo_meta", {
      isGitRepo: repoMeta.isGitRepo,
      branch: repoMeta.branch ?? "",
      latestCommit: repoMeta.latestCommit ?? "",
      dirty: repoMeta.dirty ?? false
    });

    const aiSummary = await this.llm.chat([
      {
        role: "system",
        content: "你是代码质量巡检顾问，输出务实、可执行的修复建议，避免泛泛而谈。"
      },
      {
        role: "user",
        content: `请根据以下结构化发现给出优先级修复建议：\n${JSON.stringify(findings, null, 2)}`
      }
    ]);
    this.sessionManager.addEvent(session.sessionId, "ai_review", { provider: this.llmProvider, model: this.llmModel });
    const plannerRaw = await this.llm.chat([
      {
        role: "system",
        content:
          "你是代码质量AI Agent的Planner。请输出JSON：{objectives:string[], prioritizedRisks:string[], executionPlan:string[]}，不要输出其他文本。"
      },
      {
        role: "user",
        content: `基于发现项制定修复计划：\n${JSON.stringify(findings, null, 2)}`
      }
    ]);
    this.sessionManager.addEvent(session.sessionId, "agent_planner", { provider: this.llmProvider, model: this.llmModel });
    const strategistRaw = await this.llm.chat([
      {
        role: "system",
        content:
          "你是代码质量AI Agent的Strategist。请输出JSON：{quickWins:string[], deepFixes:string[], testPlan:string[]}，不要输出其他文本。"
      },
      {
        role: "user",
        content: `根据当前扫描发现和目标路径，给出可执行修复策略：\n目标=${repoPath}\n发现数=${findings.length}`
      }
    ]);
    this.sessionManager.addEvent(session.sessionId, "agent_strategist", { provider: this.llmProvider, model: this.llmModel });
    const selectedTools = chooseTools(findings);
    const toolExecutions = executeTools(selectedTools, findings);
    this.sessionManager.addEvent(session.sessionId, "agent_executor", {
      selectedTools,
      executed: toolExecutions.map((x) => ({ name: x.name, status: x.status }))
    });
    const baselineGate = buildSelfHealingAssessment(findings, toolExecutions);
    let rescanFindings: typeof findings | undefined;
    if (baselineGate.gateDecision !== "pass") {
      rescanFindings = await scanCodeQuality(
        repoPath,
        this.config.includeExtensions,
        this.config.maxFiles,
        this.config.maxFileSizeKb,
        rules
      );
      this.sessionManager.addEvent(session.sessionId, "agent_rescan", {
        triggered: true,
        baseline: baselineGate.baseline,
        rescan: summarizeSeverity(rescanFindings),
        improvement: {
          totalReduced: baselineGate.baseline.total - rescanFindings.length,
          highReduced: baselineGate.baseline.high - rescanFindings.filter((f) => f.severity === "high").length,
          mediumReduced: baselineGate.baseline.medium - rescanFindings.filter((f) => f.severity === "medium").length,
          lowReduced: baselineGate.baseline.low - rescanFindings.filter((f) => f.severity === "low").length
        }
      });
    } else {
      this.sessionManager.addEvent(session.sessionId, "agent_rescan", { triggered: false, reason: "baseline gate already pass" });
    }
    const apply = Boolean(options?.applyGitProposal);
    const gitProposal = buildGitProposal(repoPath, findings, !apply, {
      commitMessageTemplate: this.config.gitCommitTemplate
    });
    if (gitProposal) {
      gitProposal.metadata = {
        ...gitProposal.metadata,
        protectedBranches: this.config.gitProtectedBranches
      };
    }
    const gitProposalPath = gitProposal
      ? writeGitProposal(this.config.reportDir, session.sessionId, gitProposal)
      : undefined;
    if (gitProposalPath) {
      this.sessionManager.addEvent(session.sessionId, "git_proposal", { path: gitProposalPath });
    }
    if (gitProposal && apply) {
      const applied = await executeGitProposal(gitProposal);
      this.sessionManager.addEvent(session.sessionId, "git_applied", applied as Record<string, unknown>);
    }
    const reviewerRaw = await this.llm.chat([
      {
        role: "system",
        content:
          "你是代码质量AI Agent的Reviewer。请输出JSON：{readiness:'ready'|'needs_changes'|'blocked', releaseGate:string, residualRisks:string[], nextActions:string[]}，不要输出其他文本。"
      },
      {
        role: "user",
        content: `请评审当前交付就绪度：\n发现数=${findings.length}\nGit提案=${gitProposalPath ?? "N/A"}\n目标=${repoPath}\nExecutor=${JSON.stringify(
          toolExecutions.map((x) => ({ name: x.name, status: x.status, summary: x.summary })),
          null,
          2
        )}`
      }
    ]);
    this.sessionManager.addEvent(session.sessionId, "agent_reviewer", { provider: this.llmProvider, model: this.llmModel });
    const agentAnalysis = buildAgentAnalysis(
      this.llmProvider,
      this.llmModel,
      findings,
      rescanFindings,
      plannerRaw,
      strategistRaw,
      reviewerRaw,
      toolExecutions
    );

    const reports = writeReports({
      reportDir: this.config.reportDir,
      sessionId: session.sessionId,
      target: repoPath,
      findings,
      aiSummary,
      agentAnalysis,
      events: session.events,
      gitProposalPath,
      repoMeta: {
        isGitRepo: repoMeta.isGitRepo,
        branch: repoMeta.branch ?? "",
        latestCommit: repoMeta.latestCommit ?? "",
        dirty: repoMeta.dirty ?? false
      }
    });
    this.sessionManager.addEvent(session.sessionId, "reporting", reports);

    return {
      sessionId: session.sessionId,
      targetPath: repoPath,
      markdownReport: reports.markdown,
      jsonReport: reports.json,
      htmlReport: reports.html,
      findingCount: findings.length,
      gitProposalPath,
      agentAnalysis
    };
  }
}
