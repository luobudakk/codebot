# Playbook：注入与 SSRF

## 注入类

- [ ] SQL：是否参数化 / ORM 绑定？有无字符串拼接查询？
- [ ] 命令注入：`subprocess`、`os.system`、`eval`、`pickle`、`yaml.load`（非 SafeLoader）？
- [ ] XSS：服务端模板是否未转义用户输入？前端 `dangerouslySetInnerHTML`、`v-html`？
- [ ] 模板注入（SSTI）：用户输入是否进入 Jinja2 / FreeMarker 等？

## SSRF

- [ ] 用户可控 URL 是否请求**内网**（169.254.169.254、localhost、内网段）？
- [ ] 是否支持 `file://`、gopher 或禁用协议未校验？
- [ ] 重定向是否跟随到内网？

每项标注**文件与函数**，并判断是否可达。
