# Playbook：注入与 SSRF

## 注入类检查

- SQL 是否参数化，是否存在字符串拼接查询
- 是否存在危险 `eval` / `exec` / `os.system`
- 模板渲染与前端是否存在 XSS 注入点
- 是否存在 SSTI 入口

## SSRF 检查

- 用户可控 URL 是否可能访问内网地址
- 是否限制协议（避免 `file://`、gopher 等）
- 重定向是否可能跳转到内网
