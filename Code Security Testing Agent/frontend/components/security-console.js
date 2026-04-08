"use client";

import { useMemo, useState } from "react";
import { createSession, getFindings, getJob, startScan, streamJob } from "../lib/api";

const severityOrder = ["critical", "high", "medium", "low", "info"];

export default function SecurityConsole() {
  const [sessionId, setSessionId] = useState("");
  const [job, setJob] = useState(null);
  const [findings, setFindings] = useState([]);
  const [sourceName, setSourceName] = useState("sample.py");
  const [content, setContent] = useState(
    "query = \"SELECT * FROM users WHERE id = \" + user_id\nsubprocess.run(cmd, shell=True)\n",
  );
  const [error, setError] = useState("");

  async function handleCreateSession() {
    setError("");
    const session = await createSession("Security Portfolio Demo");
    setSessionId(session.id);
  }

  async function handleStartScan() {
    if (!sessionId) {
      setError("请先创建会话。");
      return;
    }
    setError("");
    const scan = await startScan({ session_id: sessionId, source_name: sourceName, content });
    const stop = streamJob(scan.job_id, (nextJob) => setJob(nextJob));
    setTimeout(async () => {
      stop();
      const latest = await getJob(scan.job_id);
      setJob(latest);
      const rows = await getFindings(sessionId);
      setFindings(rows);
    }, 3500);
  }

  const sortedFindings = useMemo(
    () =>
      [...findings].sort(
        (a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
      ),
    [findings],
  );

  return (
    <div className="container">
      <h1>代码安全审查控制台</h1>
      <p>统一流程：创建会话 → 发起扫描任务 → 实时追踪进度 → 输出漏洞与修复建议。</p>

      <div className="card">
        <button onClick={handleCreateSession}>创建安全审查会话</button>
        <p>当前 Session: {sessionId || "未创建"}</p>
      </div>

      <div className="card">
        <div className="row">
          <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} />
          <button onClick={handleStartScan}>开始扫描</button>
        </div>
        <textarea rows={10} value={content} onChange={(e) => setContent(e.target.value)} />
        {error ? <p style={{ color: "#ff9898" }}>{error}</p> : null}
      </div>

      <div className="card">
        <h3>任务状态</h3>
        <p>状态：{job?.status || "idle"}，进度：{job?.progress || 0}%</p>
      </div>

      <div className="card">
        <h3>漏洞发现</h3>
        {sortedFindings.length === 0 ? (
          <p>暂无发现，完成扫描后展示。</p>
        ) : (
          sortedFindings.map((item) => (
            <div key={item.id} className="card">
              <div className="pill">{item.severity}</div>
              <h4>{item.title}</h4>
              <p>
                <b>分类：</b>
                {item.category} / {item.rule_id}
              </p>
              <p>
                <b>证据：</b>
                {item.evidence}
              </p>
              <p>
                <b>修复：</b>
                {item.remediation}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

