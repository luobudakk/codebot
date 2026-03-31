"use client";

import { useState } from "react";
import { API_BASE } from "../../lib/api";
import { streamPostSse } from "../../lib/sse";

export default function ChatPage() {
  const [namespaces, setNamespaces] = useState("default");
  const [query, setQuery] = useState("");
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!query.trim()) return;
    setBusy(true);
    setOut("");
    setMeta("");
    try {
      await streamPostSse(
        `${API_BASE}/v1/agents/stream`,
        {
          query,
          mode: "chat",
          namespaces: namespaces.split(",").map((s) => s.trim()).filter(Boolean),
        },
        (ev, data) => {
          if (ev === "retrieve" && typeof data === "object" && data) {
            setMeta(JSON.stringify(data));
          }
          if (ev === "assistant_delta" && typeof data === "object" && data && "token" in data) {
            setOut((o) => o + String((data as { token: string }).token));
          }
          if (ev === "assistant_done" && typeof data === "object" && data && "text" in data) {
            setOut(String((data as { text: string }).text));
          }
        },
      );
    } catch (e) {
      setMeta(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>对话（RAG + 流式）</h1>
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
        <textarea value={query} onChange={(e) => setQuery(e.target.value)} placeholder="输入问题…" />
        <div className="row" style={{ marginTop: 12 }}>
          <button type="button" disabled={busy} onClick={() => void run()}>
            {busy ? "生成中…" : "发送"}
          </button>
        </div>
        {meta ? <pre style={{ marginTop: 12 }}>retrieve: {meta}</pre> : null}
        <h3 style={{ marginTop: 16 }}>回复</h3>
        <pre style={{ color: "#e8ecf7" }}>{out}</pre>
      </div>
    </main>
  );
}
