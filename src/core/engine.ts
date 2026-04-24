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
import { RunResult } from "../utils/types";
import { mergeRules } from "../rules/registry";

export class CodeQualityBotEngine {
  // 复用原项目设计思想：可替换 LLM 工厂 + 会话管理 + 分阶段自动化执行
  private readonly sessionManager = new SessionManager();
  private readonly llm;
  private readonly logger: Logger;

  constructor(private readonly config: AppConfig) {
    this.llm = createLLM(config.llmProvider, config.llmModel, config.llmBaseUrl);
    this.logger = new Logger(config.logLevel);
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
    this.sessionManager.addEvent(session.sessionId, "ai_review", { provider: this.config.llmProvider });
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

    const reports = writeReports({
      reportDir: this.config.reportDir,
      sessionId: session.sessionId,
      target: repoPath,
      findings,
      aiSummary,
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
      gitProposalPath
    };
  }
}
