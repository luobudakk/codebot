# code-security-agent workspace

该目录是本地代码安全代理运行时工作区，通常用于：

- 接收上传样本（`uploads/`）
- 作为 Agent 的受限工作目录（配合 `restrictToWorkspace`）
- 存放任务过程产生的中间文件

## 提交建议

- 默认不提交该目录下的运行时文件（上层 `.gitignore` 仅保留本 `README`）
- 若需要保留样例，请单独放在明确命名的示例目录并脱敏

## 相关配置

可参考根目录示例配置文件：

- `nanobot.workspace.code-security.example.json`
