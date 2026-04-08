"use client";

import { useState } from "react";
import { ingestKnowledge, retrieveKnowledge } from "../lib/api";

export default function KnowledgeConsole() {
  const [source, setSource] = useState("secure-coding-guide.md");
  const [content, setContent] = useState(
    "SQL 查询必须参数化，禁止字符串拼接。\n对外请求需限制协议和目标域名，避免 SSRF。",
  );
  const [query, setQuery] = useState("如何防止 SQL 注入？");
  const [ingestResult, setIngestResult] = useState(null);
  const [retrieveResult, setRetrieveResult] = useState(null);
  const [error, setError] = useState("");

  async function onIngest() {
    setError("");
    try {
      const resp = await ingestKnowledge({ namespace: "security", source, content });
      setIngestResult(resp);
    } catch (e) {
      setError(String(e));
    }
  }

  async function onRetrieve() {
    setError("");
    try {
      const resp = await retrieveKnowledge({ namespace: "security", query, top_k: 5 });
      setRetrieveResult(resp);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="container">
      <h1>安全知识库（Advanced RAG）</h1>

      <div className="card">
        <h3>入库</h3>
        <input value={source} onChange={(e) => setSource(e.target.value)} />
        <textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
        <button onClick={onIngest}>写入知识库</button>
        {ingestResult ? <p>已入库 {ingestResult.chunks_indexed} 个 chunks。</p> : null}
      </div>

      <div className="card">
        <h3>检索</h3>
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={onRetrieve}>检索上下文</button>
        {retrieveResult ? (
          <div>
            <p>{retrieveResult.agent_notice}</p>
            {retrieveResult.hits.map((hit) => (
              <div key={hit.chunk_id} className="card">
                <p>
                  <b>来源：</b>
                  {hit.source}（score={hit.score.toFixed(3)}）
                </p>
                <p>{hit.text}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p style={{ color: "#ff9898" }}>{error}</p> : null}
    </div>
  );
}

