"use client";

import { useState } from "react";
import { API_BASE } from "../../lib/api";

export default function UploadPage() {
  const [namespace, setNamespace] = useState("default");
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<string>("");

  async function submit() {
    if (!file) {
      setLog("请选择文件");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    setLog("上传中…");
    const res = await fetch(
      `${API_BASE}/v1/ingest/upload?namespace=${encodeURIComponent(namespace)}`,
      { method: "POST", body: fd },
    );
    const text = await res.text();
    setLog(`${res.status}\n${text}`);
  }

  return (
    <main>
      <h1>文档上传</h1>
      <div className="card">
        <div className="row">
          <label>
            namespace{" "}
            <input
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              style={{
                marginLeft: 8,
                background: "#0e1528",
                border: "1px solid #243055",
                color: "#e8ecf7",
                borderRadius: 6,
                padding: "0.35rem 0.5rem",
              }}
            />
          </label>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => void submit()}>
            上传
          </button>
        </div>
        <pre>{log}</pre>
      </div>
    </main>
  );
}
