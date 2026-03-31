# code-security-web

`code-security-web` 用于承载代码安全测试流水线的运行数据与终端界面（TUI）。

## 目录说明

```text
code-security-web/
├── data/        # 流水线运行数据（本地产物，默认不提交）
└── tui/         # 基于 Ink + React 的终端 UI
```

## TUI 使用方式

```bash
cd "tui"
npm install
npm run build
node dist/index.js --url http://127.0.0.1:8787 --message "请开始安全扫描"
```

示例（带文件）：

```bash
node dist/index.js ^
  --url http://127.0.0.1:8787 ^
  --message "检查鉴权与输入校验" ^
  --scan-mode full ^
  --file "..\sample\app.py" ^
  --file "..\sample\package.json"
```

## 注意事项

- `data/` 下的 `pipelines/`、`nanobot_runtime.json`、`ui_settings.json` 是运行时数据，不建议提交。
- 提交代码前请确认没有把 `tui/node_modules/` 提交到仓库。
