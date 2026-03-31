import React, {useEffect, useMemo, useRef, useState} from "react";
import {Box, Text, useInput, render} from "ink";
import {parseSseBuffer, SseEvent} from "./sse";
import fs from "fs";
import path from "path";

type PlannerState = {
  status: "待运行" | "运行中" | "完成" | "错误";
  exitCode?: number;
  tasksCount?: number;
  note?: string;
  code?: string;
};

type WorkerState = {
  status: "排队" | "运行中" | "完成" | "错误";
  route?: string;
  note?: string;
  exitCode?: number;
  attempts?: number;
  error?: string;
};

type PipelineUiState = {
  planner: PlannerState;
  coordinator: { status: "待运行" | "运行中" | "完成" | "跳过" | "未运行"; note?: string };
  workers: Record<string, WorkerState>;
  summary: { status: "待运行" | "运行中" | "完成" | "错误" | "已跳过"; note?: string };
  runLine: string;
  summaryText: string;
};

type StartPayload = {
  job_id: string;
  upload_path?: string;
};

function parseArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
}

function parseRepeatArgs(flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && i + 1 < process.argv.length) out.push(process.argv[i + 1]);
  }
  return out;
}

async function startJob(args: {
  baseUrl: string;
  message: string;
  scanMode: string;
  modes: string;
  files: string[];
  concurrency?: number;
  signal?: AbortSignal;
}): Promise<StartPayload> {
  const form = new FormData();
  form.append("message", args.message);
  form.append("scan_mode", args.scanMode);
  form.append("modes", args.modes || "");
  if (typeof args.concurrency === "number") {
    form.append("pipeline_worker_concurrency", String(args.concurrency));
  }
  for (const fp of args.files) {
    const name = path.basename(fp);
    const stream = fs.createReadStream(fp);
    form.append("files", stream as any, name);
  }

  const r = await fetch(`${args.baseUrl}/api/pipeline/start`, {
    method: "POST",
    body: form as any,
    signal: args.signal,
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`start failed HTTP ${r.status}: ${text}`);
  }
  return (await r.json()) as StartPayload;
}

async function streamSse(args: {
  baseUrl: string;
  jobId: string;
  onEvent: (evt: SseEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const res = await fetch(`${args.baseUrl}/api/pipeline/${args.jobId}/stream`, {
    method: "GET",
    signal: args.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`stream failed HTTP ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buf);
    buf = parsed.rest;
    for (const evt of parsed.events) args.onEvent(evt);
  }
}

function workerNoteFrom(ev: any): string {
  if (ev?.error) return `${ev.error}${ev.attempts ? " · attempts " + ev.attempts : ""}`;
  const parts = [`exit ${ev?.exit_code ?? "—"}`];
  if (ev?.attempts) parts.push(`${ev.attempts} 次`);
  return parts.join(" · ");
}

export default function App() {
  const [ui, setUi] = useState<PipelineUiState>({
    planner: { status: "待运行" },
    coordinator: { status: "待运行" },
    workers: {},
    summary: { status: "待运行" },
    runLine: "",
    summaryText: "",
  });

  const abortRef = useRef<AbortController | null>(null);
  const fileList = useMemo(() => parseRepeatArgs("--file"), []);

  const cfg = useMemo(() => {
    const baseUrl = parseArgValue("--url") || process.env.CODE_SECURITY_API_URL || "http://127.0.0.1:8787";
    const message = parseArgValue("--message") || "";
    const scanMode = parseArgValue("--scan-mode") || "full";
    const modes = parseArgValue("--modes") || "";
    const concurrencyRaw = parseArgValue("--concurrency");
    const concurrency = concurrencyRaw ? Number(concurrencyRaw) : undefined;
    return { baseUrl: baseUrl.replace(/\/+$/, ""), message, scanMode, modes, concurrency };
  }, []);

  useInput((input, key) => {
    const k = key as any;
    if (k.ctrlC || (k.ctrl && (input === "c" || input === "C"))) {
      abortRef.current?.abort();
      process.exit(0);
    }
    if (input === "q") {
      abortRef.current?.abort();
      process.exit(0);
    }
  });

  useEffect(() => {
    const message = cfg.message.trim();
    const files = fileList.filter(Boolean);
    if (!message && files.length === 0) {
      setUi((p) => ({ ...p, runLine: "需要 --message 或至少一个 --file（可重复）" }));
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        setUi((p) => ({
          ...p,
          planner: { status: "运行中", note: "" },
          coordinator: { status: "待运行" },
          summary: { status: "待运行" },
          runLine: "创建 job 并开始监听 SSE…",
        }));

        const payload = await startJob({
          baseUrl: cfg.baseUrl,
          message,
          scanMode: cfg.scanMode,
          modes: cfg.modes,
          files,
          concurrency: cfg.concurrency,
          signal: ac.signal,
        });

        const jobId = payload.job_id;
        setUi((p) => ({ ...p, runLine: `job_id=${jobId} · SSE 开始` }));

        await streamSse({
          baseUrl: cfg.baseUrl,
          jobId,
          signal: ac.signal,
          onEvent: (evt) => {
            setUi((prev) => {
              const data = evt.data || {};
              if (evt.event === "plan") {
                const exitCode = typeof data.exit_code === "number" ? data.exit_code : undefined;
                const tasks = Array.isArray(data.tasks) ? data.tasks : [];
                const workers: Record<string, WorkerState> = {};
                for (const t of tasks) {
                  workers[t.id] = { status: "排队", note: (t.focus || "").slice(0, 80) };
                }
                return {
                  ...prev,
                  planner: {
                    status: exitCode === 0 ? "完成" : exitCode !== undefined ? "完成" : "完成",
                    exitCode,
                    tasksCount: tasks.length,
                    note: tasks.length + " 子任务",
                  },
                  coordinator: { status: "运行中" },
                  workers,
                  summary: { status: "待运行" },
                };
              }

              if (evt.event === "coordinator") {
                const tasks = Array.isArray(data.tasks) ? data.tasks : [];
                const workers: Record<string, WorkerState> = {};
                for (const t of tasks) {
                  const route = t.route || "?";
                  workers[t.id] = { status: "排队", route, note: `route:${route}` };
                }
                return {
                  ...prev,
                  coordinator: { status: data.enabled ? "完成" : "跳过", note: tasks.length + " 条 route 已分配" },
                  workers,
                };
              }

              if (evt.event === "worker_start") {
                const tid = data.task_id;
                if (!tid || !prev.workers[tid]) return prev;
                return {
                  ...prev,
                  workers: {
                    ...prev.workers,
                    [tid]: { ...prev.workers[tid], status: "运行中", route: data.route, note: (data.focus || "").slice(0, 80) },
                  },
                };
              }

              if (evt.event === "worker_done") {
                const tid = data.task_id;
                if (!tid || !prev.workers[tid]) return prev;
                const isErr = !!data.error;
                return {
                  ...prev,
                  workers: {
                    ...prev.workers,
                    [tid]: {
                      ...prev.workers[tid],
                      status: isErr ? "错误" : "完成",
                      exitCode: data.exit_code,
                      attempts: data.attempts,
                      error: data.error,
                      note: workerNoteFrom(data),
                    },
                  },
                };
              }

              if (evt.event === "summary_chunk") {
                const text = typeof data.text === "string" ? data.text : "";
                return {
                  ...prev,
                  summary: { ...prev.summary, status: "运行中" },
                  summaryText: (prev.summaryText + text).slice(-12000),
                  runLine: "Summary 合并输出中…",
                };
              }

              if (evt.event === "done") {
                const skippedSummary = data.all_workers_failed === true || data.summary_exit_code === -3;
                return {
                  ...prev,
                  summary: {
                    status: skippedSummary ? "已跳过" : data.summary_exit_code === 0 ? "完成" : "错误",
                    note: `summary_exit=${data.summary_exit_code ?? "—"}`,
                  },
                  runLine: skippedSummary ? `已结束（全部子任务失败）` : "完成",
                };
              }

              if (evt.event === "error") {
                if (data.node === "planner") {
                  return {
                    ...prev,
                    planner: { status: "错误", code: data.code, note: data.code ? String(data.code) : "" },
                    coordinator: { status: "未运行", note: "Planner 失败" },
                    summary: { status: "待运行", note: "Planner 失败" },
                  };
                }
                if (data.node === "summary") {
                  return { ...prev, summary: { status: "错误", note: String(data.code || "") }, runLine: "Summary 错误" };
                }
                return { ...prev, runLine: "错误: " + (data.message || JSON.stringify(data)) };
              }

              // default: ignore
              return prev;
            });
          },
        });
      } catch (e: any) {
        setUi((p) => ({ ...p, runLine: "运行失败: " + (e?.message || String(e)) }));
      }
    })();

    return () => ac.abort();
  }, [cfg, fileList]);

  const workersRows = useMemo(() => {
    const ids = Object.keys(ui.workers).sort();
    return ids.map((id) => {
      const w = ui.workers[id];
      const st = w.status === "完成" ? "OK" : w.status === "错误" ? "FAIL" : w.status;
      return `${id} [${st}] ${w.note || ""}`.trim();
    });
  }, [ui.workers]);

  const summaryPreview = useMemo(() => {
    const t = ui.summaryText || "";
    if (!t.trim()) return "";
    const s = t.trim().slice(0, 4200);
    return s + (t.length > 4200 ? "\n...（已截断）" : "");
  }, [ui.summaryText]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>code-security-web TUI</Text>
      <Text dimColor>{cfg.baseUrl} · q退出</Text>
      <Box marginTop={1}>
        <Text>
          Planner: {ui.planner.status}
          {ui.planner.note ? ` · ${ui.planner.note}` : ""}
        </Text>
        <Text>
          Coordinator: {ui.coordinator.status}
          {ui.coordinator.note ? ` · ${ui.coordinator.note}` : ""}
        </Text>
        <Text>
          Summary: {ui.summary.status}
          {ui.summary.note ? ` · ${ui.summary.note}` : ""}
        </Text>
        {ui.runLine ? (
          <Text dimColor>
            {ui.runLine}
          </Text>
        ) : null}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text underline>Workers</Text>
        {workersRows.length === 0 ? <Text dimColor>（等待 plan / coordinator）</Text> : null}
        {workersRows.map((r, idx) => (
          <Text key={idx}>{r}</Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text underline>Summary</Text>
        {summaryPreview ? (
          <Text>{summaryPreview}</Text>
        ) : (
          <Text dimColor>（等待 Summary 输出）</Text>
        )}
      </Box>
    </Box>
  );
}

render(<App />);

