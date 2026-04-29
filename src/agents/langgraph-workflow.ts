import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { LLMProvider } from "../ai/providers";
import { chooseTools, executeTools, planToolLayers, ToolLayer } from "./toolchain";
import type { Finding } from "../utils/types";

type ToolExecution = {
  name: string;
  status: "ok" | "skipped" | "error";
  summary: string;
  output: Record<string, unknown>;
};

const AgentGraphState = Annotation.Root({
  findingsJson: Annotation<string>(),
  plannerRaw: Annotation<string>(),
  strategistRaw: Annotation<string>(),
  reviewerRaw: Annotation<string>(),
  selectedTools: Annotation<string[]>(),
  toolLayers: Annotation<ToolLayer[]>(),
  toolExecutions: Annotation<ToolExecution[]>()
});

type AgentGraphInput = {
  llm: LLMProvider;
  findings: Finding[];
  repoPath: string;
};

export async function runLangGraphAgentWorkflow(input: AgentGraphInput): Promise<{
  plannerRaw: string;
  strategistRaw: string;
  reviewerRaw: string;
  toolLayers: ToolLayer[];
  toolExecutions: ToolExecution[];
}> {
  const graph = new StateGraph(AgentGraphState)
    .addNode("planner", async (state) => {
      const plannerRaw = await input.llm.chat([
        {
          role: "system",
          content:
            "你是 Codebot Planner。必须使用简体中文输出。只返回 JSON，不要 Markdown，不要解释：{objectives:string[], prioritizedRisks:string[], executionPlan:string[]}"
        },
        {
          role: "user",
          content: `请基于以下发现生成“按优先级排序”的修复计划（中文）：\n${state.findingsJson}`
        }
      ]);
      return { plannerRaw };
    })
    .addNode("strategist", async (state) => {
      const strategistRaw = await input.llm.chat([
        {
          role: "system",
          content:
            "你是 Codebot Strategist。必须使用简体中文输出。只返回 JSON，不要 Markdown，不要解释：{quickWins:string[], deepFixes:string[], testPlan:string[]}"
        },
        {
          role: "user",
          content: `目标路径=${input.repoPath}\n发现数=${input.findings.length}\nPlanner 输出：\n${state.plannerRaw}\n请给出中文策略。`
        }
      ]);
      return { strategistRaw };
    })
    .addNode("executor", async () => {
      const selectedTools = chooseTools(input.findings);
      const toolLayers = planToolLayers(selectedTools);
      const toolExecutions: ToolExecution[] = [];
      for (const layer of toolLayers) {
        toolExecutions.push(...executeTools(layer.tools, input.findings));
      }
      return { selectedTools, toolLayers, toolExecutions };
    })
    .addNode("reviewer", async (state) => {
      const reviewerRaw = await input.llm.chat([
        {
          role: "system",
          content:
            "你是 Codebot Reviewer。必须使用简体中文输出。只返回 JSON，不要 Markdown，不要解释：{readiness:'ready'|'needs_changes'|'blocked', releaseGate:string, residualRisks:string[], nextActions:string[]}"
        },
        {
          role: "user",
          content: `请评估交付就绪度并给出中文建议。\n发现数=${input.findings.length}\nStrategist：\n${state.strategistRaw}\n执行记录：\n${JSON.stringify(
            state.toolExecutions.map((x) => ({ name: x.name, status: x.status, summary: x.summary })),
            null,
            2
          )}`
        }
      ]);
      return { reviewerRaw };
    })
    .addEdge(START, "planner")
    .addEdge("planner", "strategist")
    .addEdge("strategist", "executor")
    .addEdge("executor", "reviewer")
    .addEdge("reviewer", END);

  const app = graph.compile();
  const result = await app.invoke({
    findingsJson: JSON.stringify(input.findings, null, 2),
    plannerRaw: "",
    strategistRaw: "",
    reviewerRaw: "",
    selectedTools: [],
    toolLayers: [],
    toolExecutions: []
  });

  return {
    plannerRaw: result.plannerRaw,
    strategistRaw: result.strategistRaw,
    reviewerRaw: result.reviewerRaw,
    toolLayers: result.toolLayers,
    toolExecutions: result.toolExecutions
  };
}
