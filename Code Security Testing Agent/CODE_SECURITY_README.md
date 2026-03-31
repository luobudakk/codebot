# 代码安全智能体（nanobot workspace + Web UI）

## 1. 安装 nanobot

```powershell
pip install nanobot-ai
```

配置好 API Key（与官方文档一致），可用 `nanobot onboard` 或手编辑用户目录下的 nanobot 配置 JSON。

可选：复制本目录 `nanobot.workspace.code-security.example.json` 中的 `agents.defaults.workspace` 到正式配置，或每次用 `-w` 指定 workspace。

## 2. 安全专用 workspace

路径：`code-security-agent/`

- 已含 `AGENTS.md`、`SOUL.md`、`skills/`（含 `code-security-core` 的 always skill）。
- Web 上传的文件会落在 `code-security-agent/uploads/<jobId>/`（已在 `.gitignore` 中忽略）。

CLI 单次审阅示例：

```powershell
nanobot agent -w ".\code-security-agent" --no-markdown -m "请 list_dir 浏览 uploads 目录并说明最近一次上传应如何审阅"
```

## 3. Web UI

```powershell
cd ".\code-security-web"
.\start.ps1
```

浏览器打开 <http://127.0.0.1:8787>。在页面顶部的 **设置** 中填写 Workspace、Provider、Model、API Key 等，点击 **保存设置**（会写入 `code-security-web/data/ui_settings.json`）。然后再上传文件审阅。每次审阅会生成 `data/nanobot_runtime.json` 并通过 `nanobot agent -c …` 传入。

环境变量（可选，作为首次默认值；多数项可在网页里改）：

| 变量 | 含义 |
|------|------|
| `CODE_SECURITY_WORKSPACE` | 默认 workspace |
| `NANOBOT_CONFIG` | 默认基础配置文件路径 |
| `NANOBOT_BIN` | 默认可执行文件 |
| `CODE_SECURITY_SCAN_TIMEOUT_SEC` | 默认超时秒数 |
| **注意** | API Key 写在 UI 后会存盘在 `data/ui_settings.json`，请勿提交到 Git（已 `.gitignore`） |

## 4. 快捷脚本

`run-code-security-agent.ps1`：`gateway` 或 `agent` 模式，`-Message` 传 `-m` 文本。

