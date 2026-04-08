import "./globals.css";

export const metadata = {
  title: "Code Security Runtime",
  description: "Enterprise-grade code security review with integrated RAG",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
