import path from "node:path";
import { Finding, FixSuggestion, RuleDefinition } from "../utils/types";

const extensionToLanguage: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python"
};

const defaultRules: RuleDefinition[] = [
  {
    id: "EMPTY_CATCH_OR_BARE_EXCEPT",
    enabled: true,
    languages: ["typescript", "javascript", "python"],
    severity: "high",
    message: "存在空 catch 或裸 except，可能隐藏关键错误。",
    suggestion: "补充错误日志与分类处理，避免吞错。",
    pattern: "catch\\s*\\(\\s*\\)\\s*\\{|except:\\s*"
  },
  {
    id: "DEBUG_OUTPUT_LEFTOVER",
    enabled: true,
    languages: ["typescript", "javascript", "python"],
    severity: "low",
    message: "发现调试输出语句。",
    suggestion: "改为统一日志组件，并按环境控制输出级别。",
    pattern: "\\bconsole\\.log\\(|\\bprint\\("
  },
  {
    id: "OVERSIZED_FILE",
    enabled: true,
    languages: ["typescript", "javascript", "python"],
    severity: "medium",
    message: "文件体积过大，维护成本较高。",
    suggestion: "按职责拆分模块，降低耦合。",
    pattern: "__FILE_LINE_COUNT_GT_450__"
  }
];

export function mergeRules(externalRules: RuleDefinition[] | undefined): RuleDefinition[] {
  if (!externalRules?.length) return defaultRules;
  const byId = new Map(defaultRules.map((r) => [r.id, r]));
  for (const rule of externalRules) byId.set(rule.id, rule);
  return [...byId.values()];
}

function getLanguage(filePath: string): string {
  return extensionToLanguage[path.extname(filePath).toLowerCase()] ?? "unknown";
}

function buildFixSuggestion(ruleId: string): FixSuggestion {
  if (ruleId === "DEBUG_OUTPUT_LEFTOVER") {
    return {
      strategy: "search_replace",
      confidence: 0.82,
      patchPreview: "console.log(...) -> logger.debug(...)",
      rollbackHint: "恢复原文件并重新运行 npm test 验证日志行为。"
    };
  }
  return {
    strategy: "manual",
    confidence: 0.7,
    patchPreview: "补充异常处理、边界判断与错误日志",
    rollbackHint: "保留变更前快照，出现回归时按文件级回滚。"
  };
}

export function runRuleRegistry(filePath: string, content: string, rules: RuleDefinition[]): Finding[] {
  const language = getLanguage(filePath);
  const findings: Finding[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.languages.includes(language)) continue;
    const matched =
      rule.pattern === "__FILE_LINE_COUNT_GT_450__"
        ? (content.match(/\n/g)?.length ?? 0) > 450
        : new RegExp(rule.pattern, "m").test(content);
    if (!matched) continue;
    findings.push({
      filePath,
      language,
      ruleId: rule.id,
      severity: rule.severity,
      message: rule.message,
      suggestion: rule.suggestion,
      fix: buildFixSuggestion(rule.id)
    });
  }
  return findings;
}
