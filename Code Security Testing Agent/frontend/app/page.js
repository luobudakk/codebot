export default function HomePage() {
  return (
    <main className="container">
      <h1>Code Security Runtime</h1>
      <p>企业级代码安全审查平台：扫描审查 + 证据检索 + 可追溯输出。</p>
      <div className="card">
        <ul>
          <li>
            <a href="/security">进入安全扫描控制台</a>
          </li>
          <li>
            <a href="/knowledge">进入安全知识库检索台</a>
          </li>
        </ul>
      </div>
    </main>
  );
}

