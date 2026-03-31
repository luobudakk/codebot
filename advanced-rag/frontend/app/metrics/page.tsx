"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../../lib/api";

export default function MetricsPage() {
  const [txt, setTxt] = useState<string>("加载中…");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/metrics`);
        setTxt(await res.text());
      } catch (e) {
        setTxt(String(e));
      }
    })();
  }, []);

  return (
    <main>
      <h1>Prometheus Metrics</h1>
      <p className="muted">直读后端 /metrics（含 agent_*、retrieval_* 等）。</p>
      <pre style={{ maxHeight: "70vh", overflow: "auto" }}>{txt}</pre>
    </main>
  );
}
