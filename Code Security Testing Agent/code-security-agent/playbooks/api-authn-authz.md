# Playbook：API 认证与授权

审阅 API / HTTP handler 时逐项自查：

- [ ] 所有敏感操作是否要求**认证**（session / JWT / mTLS 等）？
- [ ] 用户身份是否来自**可信源**（非仅客户端上报的 userId）？
- [ ] **对象级授权**：能否通过改 ID 访问他人资源（IDOR）？
- [ ] **管理员**与普通角色分离；敏感操作是否有二次校验或审计日志？
- [ ] JWT：`alg=none`、弱密钥、未校验 `aud`/`iss`、过长有效期？
- [ ] CORS：是否反射任意 `Origin` 且 `Credentials` 为 true？

记录每项**代码位置**与**结论**。
