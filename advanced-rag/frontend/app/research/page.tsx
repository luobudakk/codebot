"use client";

import { useState } from "react";
import { API_BASE } from "../../lib/api";
import { streamPostSse } from "../../lib/sse";

type LogLine = { t: number; event: string; msg: string };
type RoleStatus = "idle" | "running" | "done" | "error";
type SpecialistStatus = { doneCount: number; totalCount: number };

export default function ResearchPage() {
  const [namespaces, setNamespaces] = useState("default");
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState("");
  const [log, setLog] = useState<LogLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [plannerStatus, setPlannerStatus] = useState<RoleStatus>("idle");
  const [coordinatorStatus, setCoordinatorStatus] = useState<RoleStatus>("idle");
  const [specialistStatus, setSpecialistStatus] = useState<SpecialistStatus>({
    doneCount: 0,
    totalCount: 0,
  });
  const [summaryStatus, setSummaryStatus] = useState<RoleStatus>("idle");

  function push(ev: string, data: unknown) {
    const msg =
      typeof data === "string" ? data : JSON.stringify(data, null, 0).slice(0, 2000);
    setLog((l) => [...l, { t: Date.now(), event: ev, msg }]);
  }

  async function run() {
    if (!query.trim()) return;
    setBusy(true);
    setLog([]);
    setSummary("");
    setPlannerStatus("running");
    setCoordinatorStatus("idle");
    setSpecialistStatus({ doneCount: 0, totalCount: 0 });
    setSummaryStatus("idle");
    try {
      await streamPostSse(
        `${API_BASE}/v1/agents/stream`,
        {
          query,
          mode: "research",
          namespaces: namespaces.split(",").map((s) => s.trim()).filter(Boolean),
        },
        (ev, data) => {
          if (ev === "planner") {
            setPlannerStatus("done");
            setCoordinatorStatus("running");
            if (typeof data === "object" && data && "steps" in data) {
              const steps = (data as { steps?: unknown[] }).steps;
              if (Array.isArray(steps)) {
                setSpecialistStatus((s) => ({ ...s, totalCount: steps.length }));
              }
            }
            push(ev, data);
            return;
          }
          if (ev === "planner_error") {
            setPlannerStatus("error");
            setCoordinatorStatus("error");
            push(ev, data);
            return;
          }
          if (ev === "coordinator") {
            if (typeof data === "object" && data && "status" in data) {
              const st = String((data as { status?: string }).status);
              if (st === "started") setCoordinatorStatus("running");
              if (st === "done") {
                setCoordinatorStatus("done");
                setSummaryStatus("running");
              }
            }
            push(ev, data);
            return;
          }
          if (ev === "expert_done") {
            setSpecialistStatus((s) => ({ ...s, doneCount: s.doneCount + 1 }));
            push(ev, data);
            return;
          }
          if (
            ev === "summary_delta" &&
            typeof data === "object" &&
            data &&
            "token" in data
          ) {
            setSummary((s) => s + String((data as { token: string }).token));
            return;
          }
          if (ev === "summary_done" && typeof data === "object" && data && "text" in data) {
            setSummaryStatus("done");
            setSummary(String((data as { text: string }).text));
            push(ev, data);
            return;
          }
          if (ev === "expert_delta") {
            return;
          }
          if (ev === "error") {
            setSummaryStatus("error");
            setCoordinatorStatus((s) => (s === "done" ? s : "error"));
          }
          if (ev === "done") {
            setSummaryStatus((s) => (s === "idle" ? "done" : s));
          }
          push(ev, data);
        },
      );
    } catch (e) {
      setPlannerStatus((s) => (s === "idle" ? "error" : s));
      setCoordinatorStatus((s) => (s === "idle" ? "error" : s));
      setSummaryStatus("error");
      push("error", String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>研究流水线（多智能体 SSE）</h1>
      <div className="card">
        <label className="muted">namespaces（逗号分隔）</label>
        <input
          value={namespaces}
          onChange={(e) => setNamespaces(e.target.value)}
          style={{
            width: "100%",
            marginBottom: 12,
            background: "#0e1528",
            border: "1px solid #243055",
            color: "#e8ecf7",
            borderRadius: 8,
            padding: "0.5rem 0.75rem",
          }}
        />
        <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="研究课题…" />
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" disabled={busy} onClick={() => void run()}>
            {busy ? "运行中…" : "启动流水线"}
          </button>
        </div>
      </div>
      <div className="card">
        <h3>事件流</h3>
        <pre style={{ maxHeight: 320, overflow: "auto" }}>
          {log.map((l) => `${l.event}: ${l.msg}\n`).join("")}
        </pre>
      </div>
      <div className="card">
        <h3>角色状态</h3>
        <div className="roleGrid">
          <div className={`rolePill role-${plannerStatus}`}>
            <strong>Planner</strong>
            <span>{plannerStatus}</span>
          </div>
          <div className={`rolePill role-${coordinatorStatus}`}>
            <strong>Coordinator</strong>
            <span>{coordinatorStatus}</span>
          </div>
          <div
            className={`rolePill role-${
              specialistStatus.totalCount > 0 && specialistStatus.doneCount >= specialistStatus.totalCount
                ? "done"
                : specialistStatus.doneCount > 0
                  ? "running"
                  : "idle"
            }`}
          >
            <strong>Specialist</strong>
            <span>
              {specialistStatus.doneCount}/{specialistStatus.totalCount || "?"}
            </span>
          </div>
          <div className={`rolePill role-${summaryStatus}`}>
            <strong>Summary</strong>
            <span>{summaryStatus}</span>
          </div>
        </div>
      </div>
      <div className="card">
        <h3>最终总括（Summary）</h3>
        <pre style={{ color: "#e8ecf7" }}>{summary}</pre>
      </div>
    </main>
  );
}
