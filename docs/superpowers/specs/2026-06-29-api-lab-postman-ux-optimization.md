# API Lab Postman UX Optimization

日期：2026-06-29

## Design Conclusion

API Lab 第二轮优化借鉴 Postman 的请求工作台习惯，但继续保持 DevLauncher 静态 WebView 插件的紧凑风格。优化重点是信息架构和高频操作：请求行、Params/Auth/Headers/Body、Collection/History、响应工具条和变量预览。

本轮不实现 native HTTP、OAuth 完整流程、Scripts/Tests、Cookie jar 或文件上传。

## Goals

- 请求行更像日常 API 客户端：请求名称、method、URL、Send、Cancel 一屏完成。
- 请求编辑区 tabs 调整为 `Params / Auth / Headers / Body`。
- Auth 支持 `No Auth`、`Bearer Token`、`Basic Auth`。
- URL 下方展示 resolved URL，帮助用户确认环境变量替换结果。
- 左侧 Collection/History 增强扫描效率：搜索框、method badge、status/time 信息。
- 响应区增加工具条：复制 Body、复制 Headers、保存为请求。
- 空状态增加可一键载入的示例请求。
- 保持现有 localStorage 数据兼容，旧请求加载后能补默认 auth 字段。

## Non-Goals

- 不新增 Tauri/native HTTP 能力。
- 不绕过浏览器 CORS。
- 不实现 Postman Collection 导入。
- 不实现 OAuth、Digest、AWS Signature、脚本和测试。
- 不改 DevLauncher 插件 manifest schema。

## Interaction Notes

- `Auth` tab 写入请求 headers，但用户仍可在 Headers tab 明确覆盖。
- Bearer Token 可以使用 `{{token}}` 变量。
- Basic Auth 在浏览器侧生成 `Authorization: Basic ...`。
- History 点击仍只载入请求，不自动发送。
- 响应复制失败时用 inline status 提示，不弹阻塞错误。

## Validation

- API Lab smoke test 覆盖新增 `Auth`、resolved URL、copy response、example request 等关键锚点。
- marketplace release zip 需要重新打包，`marketplace.json` 的 sha256 必须同步更新。
- 继续跑 `app` 的 test/build，确保插件市场主应用没有破坏。
