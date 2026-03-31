import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Advanced RAG",
  description: "Multi-agent RAG UI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="container">
          <nav className="nav">
            <a href="/">首页</a>
            <a href="/upload">上传</a>
            <a href="/chat">对话</a>
            <a href="/research">研究流水线</a>
            <a href="/metrics">Metrics</a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
