# Code Security Testing Agent

一个用于代码安全测试与自动化分析的增量项目（基于开源 `nanobot` 生态进行二次开发），当前仓库只保留你自己的模块与运行脚本：

- `code-security-agent`：本地工作区（运行时目录）
- `code-security-web`：安全测试流水线相关数据与 TUI 端
- `run-code-security-agent.ps1`：Windows 一键运行脚本

## 项目结构

```text
Code Security Testing Agent/
├── code-security-agent/ # 本地工作区（运行时）
├── code-security-web/   # 安全测试流水线（数据 + TUI）
├── run-code-security-agent.ps1
└── README.md
```

## 快速开始

### 1) 安装 nanobot 依赖（上游）

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -U nanobot-ai
```

> 本仓库不再包含 `nanobot` 上游源码，只依赖其已发布包。你可以在此基础上维护自己的增量能力。

### 2) 启动 TUI（code-security-web/tui）

```bash
cd "..\code-security-web\tui"
npm install
npm run build
node dist/index.js --url http://127.0.0.1:8787 --message "请开始安全扫描"
```

### 3) Windows 快速运行脚本（可选）

项目根目录提供 `run-code-security-agent.ps1`，可直接调用 nanobot：

```powershell
.\run-code-security-agent.ps1 -Mode agent
.\run-code-security-agent.ps1 -Mode agent -Message "请分析这个代码仓库的安全风险"
.\run-code-security-agent.ps1 -Mode gateway
```

TUI 常用参数：

- `--url`：后端 API 地址（默认 `http://127.0.0.1:8787`）
- `--message`：扫描任务描述
- `--file`：可重复传入待扫描文件
- `--scan-mode`：扫描模式（默认 `full`）
- `--modes`：指定子模式
- `--concurrency`：并发 worker 数量

## 上传 GitHub 前建议

- 确保不要提交本地依赖目录（如 `node_modules/`、`.venv/`）
- 确保不要提交工作区上传产物（如 `code-security-agent/uploads/`）
- 确保不要提交运行时数据与日志（如 `code-security-web/data/pipelines/`）
- 确保不要提交密钥文件（如 `.env`、私有配置）

本仓库已通过 `.gitignore` 处理以上常见项。

## 上游致谢

- 上游项目：`nanobot`（HKUDS）
- 当前仓库策略：只发布你自己的增量代码，不打包上游完整源码

## 后续可选优化

- 增加 `LICENSE`（如 MIT）
- 增加 `CONTRIBUTING.md` 统一协作流程
- 增加 GitHub Actions（lint / test / build）
