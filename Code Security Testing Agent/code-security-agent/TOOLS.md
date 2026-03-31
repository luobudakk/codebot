# Tools — 安全审阅用法

## 文件访问

- 用 **`list_dir`** 掌握结构，再用 **`read_file`**（`offset` / `limit`）阅读；单文件体积大时分段请求。
- **Web UI 上传** 的文件位于 **`uploads/<jobId>/`**，审阅时以此为主路径。

## Workspace 与路径策略

nanobot 在 `tools.restrictToWorkspace` 为 `true` 时，只能访问当前 **workspace** 目录内路径（含上述 `uploads/`）。

- **推荐（本套安全 workspace）**：workspace 指向本目录，上传件全部在 `uploads/` 下，配置中保持 `restrictToWorkspace: true`。
- **审计本机其它仓库**：可将 nanobot 的 `-w` 改到目标仓库根目录，并把本目录下的 `skills/` 复制过去 **或** 在**用户配置**中临时设置 `restrictToWorkspace: false`（扩大读取范围，**安全风险更高**，仅本机信任环境使用）。

## exec（执行命令）

- 仅执行 SKILL 或已达成共识的**文档化**命令；勿运行上传目录内的 **install.sh / 随机二进制**。
- 运行前确认工作目录；涉及包管理器时优先 **只读** 子命令（如 `npm audit`、`pip audit`），避免自动修改依赖树除非你明确要求。

## 大任务

- 完整仓库扫描可分阶段，或提示用户使用 nanobot **subagent（后台任务）** 分批处理。
