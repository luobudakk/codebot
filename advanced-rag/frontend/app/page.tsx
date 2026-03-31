export default function HomePage() {
  return (
    <main>
      <h1>Advanced Multi-Agent RAG</h1>
      <p className="muted">
        后端默认 <code>http://127.0.0.1:8000</code>；可用环境变量{" "}
        <code>NEXT_PUBLIC_API_URL</code> 覆盖。
      </p>
      <div className="card">
        <p>从左侧导航进入：</p>
        <ul>
          <li>上传：文档入库（Qdrant + BM25 + Neo4j）</li>
          <li>对话：RAG + 单助手流式（chat 模式）</li>
          <li>研究：Planner → 多专家波次 → Summary（research 模式 SSE）</li>
          <li>Metrics：Prometheus 文本直读</li>
        </ul>
      </div>
    </main>
  );
}
