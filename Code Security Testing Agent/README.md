# Code Security Testing Agent

基于 `nanobot` 架构思想二次开发的代码安全测试智能体项目（不包含上游完整源码）。

本项目聚焦“代码安全审阅”场景，提供：

- 安全专用 Agent workspace（规则、角色、技能、playbooks）
- FastAPI Web 服务（上传代码、分发子任务、汇总结果）
- Web 界面与可选 TUI 监控
- 多子任务并发分析流水线（Planner / Coordinator / Worker / Summary）

## 项目结构

```text
Code Security Testing Agent/
├── code-security-agent/       # nanobot 工作区（角色与技能配置）
│   ├── AGENTS.md
│   ├── SOUL.md / TOOLS.md / USER.md / HEARTBEAT.md
│   ├── skills/
│   └── playbooks/
├── code-security-web/         # Web 服务与前端页面
│   ├── app/                   # FastAPI 应用
│   ├── static/                # 页面静态资源
│   ├── data/                  # 运行时数据（已忽略）
│   ├── requirements.txt
│   ├── start.ps1 / start.bat
│   └── cli.ps1
├── CODE_SECURITY_README.md    # 旧版说明（保留）
└── README.md
```

## 功能概览

- **安全多智能体流程**：Planner 拆任务，Coordinator 分配 route，Workers 并行执行，Summary 汇总输出
- **上传即审阅**：Web 上传代码样本后自动触发审阅流水线
- **可配置模型/供应商**：支持在 UI 中配置 provider/model/api key
- **面向安全的技能体系**：静态分析、依赖与供应链、密钥泄露、鉴权与注入等

## 快速开始（Windows）

### 1) 安装依赖

```powershell
pip install nanobot-ai
```

### 2) 启动 Web 服务

```powershell
cd ".\code-security-web"
.\start.ps1
```

默认地址：`http://127.0.0.1:8787`

### 3) 在页面配置并运行

- 在页面顶部设置 workspace/provider/model/api key
- 上传待审阅代码
- 等待流水线输出分析结果

## 运行脚本

- `code-security-web/start.ps1`：启动 FastAPI 服务
- `code-security-web/cli.ps1`：命令行运行 web 工具入口
- `run-code-security-agent.ps1`（如存在于仓库上层历史版本）：直连 nanobot 的 agent/gateway 入口

## 隐私与提交说明

以下内容默认不应提交（已在 `.gitignore` 处理）：

- `code-security-agent/sessions/`（历史会话）
- `code-security-agent/memory/`（运行时记忆）
- `code-security-agent/uploads/`（上传样本）
- `code-security-web/data/ui_settings.json`（可能含 API key）
- `code-security-web/data/nanobot_runtime.json` / `data/pipelines/`
- `code-security-web/tui/node_modules/`、`__pycache__/`

## 备注

- 本项目是面向安全测试流程的工程化实现，不是上游 nanobot 的完整镜像仓库。
- 发布前建议先执行：`git status`，确认仅包含源码与文档变更。
