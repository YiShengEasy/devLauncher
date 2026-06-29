# API Lab Plugin Design

日期：2026-06-29

## Design Conclusion

DevLauncher 的 Postman-like 工具采用“两阶段”方案：第一阶段交付官方静态 WebView 插件 `API Lab`，先验证轻量 API 调试工作流；第二阶段在 DevLauncher 主应用中沉淀受控的 native HTTP 能力，再让插件从浏览器 `fetch` 切换到 Tauri command。

第一阶段不追求完整复刻 Postman。它要成为一个启动快、界面紧凑、能保存请求和切换环境的日常 API 请求工具。浏览器 CORS 限制作为第一阶段的已知边界写清楚，不在 MVP 中用高权限能力绕过。

## Goals

- 交付一个可安装、可搜索、可打开的官方 DevLauncher 市场插件。
- 使用现有 `plugin.json + dist/index.html` 静态 WebView 插件格式。
- 支持常见 HTTP 请求编辑：method、URL、query、headers、body。
- 支持发送请求并查看 status、耗时、响应头和响应体。
- 支持 JSON 响应格式化，非 JSON 响应按文本展示。
- 支持环境变量，例如 `{{baseUrl}}`、`{{token}}`。
- 支持 Collection 保存常用请求。
- 支持 History 记录最近请求并快速重试。
- 支持导入导出 API Lab 自有 JSON 格式。
- 明确记录第一阶段 CORS、代理、证书和复杂认证限制。

## Non-Goals

- 不实现完整 Postman Collection 兼容。
- 不实现 OAuth 全流程向导。
- 不实现 GraphQL 专门面板。
- 不实现 WebSocket、gRPC 或 SSE 调试。
- 不实现 pre-request script、test script 或自动化 runner。
- 不实现团队同步、云端账户或远程协作。
- 不实现文件上传、multipart 复杂表单或二进制响应查看。
- 不新增 Tauri 原生权限。
- 不读取系统代理、证书、Cookie jar 或密钥库。
- 不把第一版直接做成 DevLauncher 内置功能。

## Reference Direction

- Bruno：参考本地优先、Git 友好和 Collection 文件化的长期方向。
- Hoppscotch：参考轻量、快速发请求和 Web 化体验。
- Insomnia：参考成熟 API Client 的信息架构，但第一版不照搬其完整功能体量。
- Yaak：参考现代桌面 API Client 的简洁请求体验。
- Hurl：参考文本化、可版本管理和可自动化的后续可能性。

## Plugin Identity

插件包放在示例和市场目录中：

```text
examples/plugins/api-lab/
  plugin.json
  icon.svg
  README.md
  dist/
    index.html

marketplace/plugins/api-lab/
  README.md

marketplace/icons/api-lab.svg
```

Manifest：

```json
{
  "id": "devlauncher.tools.api-lab",
  "name": "API Lab",
  "version": "1.0.0",
  "kind": "webview",
  "description": "轻量 API 请求、环境变量、集合和历史记录工具。",
  "entry": "dist/index.html",
  "icon": "icon.svg",
  "actions": [
    {
      "id": "open",
      "title": "打开 API Lab",
      "type": "webview"
    }
  ]
}
```

第一版不扩展 manifest schema。启动器搜索依赖插件名称、描述和动作标题。

## First Phase Scope

### Request Editor

- 支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`。
- URL 输入支持环境变量插值。
- Query 使用 key/value 表格编辑，并同步到 URL。
- Headers 使用 key/value 表格编辑。
- Body 支持 `none`、`json`、`text` 三种模式。
- JSON body 提供格式化动作；格式化失败时保留原内容并显示错误。
- Send 按钮发送当前请求，Cancel 按钮中止正在进行的请求。

### Response Viewer

- 展示 status code、status text、耗时、响应大小和最终 URL。
- 响应头用只读 key/value 列表展示。
- JSON 响应自动 pretty print。
- 非 JSON 响应用等宽文本展示。
- 请求失败时展示错误类型，例如网络失败、CORS 拦截、超时或用户取消。
- 响应区域保持稳定高度，错误和空状态不导致布局大幅跳动。

### Environments

- 支持多个环境：例如 `Local`、`Dev`、`Prod`。
- 每个环境保存变量 key/value。
- 变量用 `{{name}}` 插值到 URL、headers 和 body。
- 未定义变量不静默吞掉，发送前显示缺失变量提示。
- 第一版变量只保存在插件本地数据中，不写入系统密钥库。

### Collections

- 支持创建分组和保存请求。
- 保存内容包括 method、URL、query、headers、body mode、body content 和选中的环境引用。
- 支持重命名、复制、删除请求。
- 点击 Collection 中的请求会加载到编辑器，不自动发送。
- 第一版 Collection 数据保存在 `localStorage`，导出后可作为备份。

### History

- 每次发送后记录 method、resolved URL、status、耗时、时间戳和请求快照。
- History 默认保留最近 100 条。
- 支持从历史记录恢复请求。
- 不保存响应体，避免本地数据快速膨胀。

### Import And Export

第一版支持 API Lab 自有 JSON 格式：

```json
{
  "version": 1,
  "environments": [],
  "collections": []
}
```

导入时校验 `version` 和基本字段类型。非法文件不覆盖现有数据。第一版不承诺兼容 Postman、Insomnia、Bruno 或 OpenAPI 文件。

## UI Design

API Lab 是一个工具界面，不做 landing page。

整体布局：

```text
+---------------------------------------------------------------+
| API Lab                                  active env  [Send]    |
| [GET v] [https://api.example.com/users/{{id}}             ]   |
|---------------------------------------------------------------|
| Collection / History / Env | Request tabs                     |
|                            | Query | Headers | Body            |
|                            | key/value editor or body editor   |
|---------------------------------------------------------------|
| Response | Headers                                            |
| status, time, size                                             |
| formatted body                                                 |
+---------------------------------------------------------------+
```

视觉规则：

- 使用 DevLauncher 插件工具窗的深色、紧凑、小圆角风格。
- 不使用大面积营销式 hero、介绍卡片或装饰渐变。
- 控件高度稳定，发送中、错误、空状态不改变主要布局。
- 左侧面板可在窄窗口下折叠为顶部 tabs。
- Request 和 Response 区域使用等宽字体展示技术文本。
- 按钮使用短命令：`发送`、`取消`、`保存`、`复制`、`格式化`、`导出`、`导入`。
- 错误提示在当前区域内显示，不使用阻塞弹窗。

## Data Model

插件本地存储结构：

```ts
interface ApiLabState {
  activeEnvironmentId: string | null;
  environments: ApiEnvironment[];
  collections: ApiCollection[];
  history: ApiHistoryEntry[];
  draft: ApiRequestDraft;
}

interface ApiEnvironment {
  id: string;
  name: string;
  variables: Array<{ key: string; value: string }>;
}

interface ApiRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  query: Array<{ key: string; value: string; enabled: boolean }>;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  bodyMode: "none" | "json" | "text";
  body: string;
}

interface ApiCollection {
  id: string;
  name: string;
  requests: ApiRequest[];
}
```

所有数据结构都带 `version`，便于后续迁移。第一版不加密变量，UI 要避免把变量叫做“安全密钥库”。

## Architecture

第一阶段插件内部模块：

```text
ApiLabApp
  StorageAdapter
  VariableResolver
  RequestBuilder
  FetchTransport
  CollectionPanel
  HistoryPanel
  EnvironmentPanel
  RequestEditor
  ResponseViewer
  ImportExport
```

模块边界：

- `StorageAdapter`：读写 `localStorage`，处理版本和默认数据。
- `VariableResolver`：解析 `{{name}}`，返回 resolved value 和缺失变量列表。
- `RequestBuilder`：把 editor state 转成 `fetch` 参数。
- `FetchTransport`：负责 `fetch`、AbortController、耗时统计和错误归一化。
- `ImportExport`：负责 JSON 格式校验、导入合并和导出下载。

插件不调用 Tauri invoke，不访问 Node API，不依赖 CDN。所有脚本和样式打进 `dist/index.html`。

## Second Phase Native HTTP

第二阶段新增 DevLauncher 主应用能力，但不把 API Lab UI 内置到主应用。

目标 command：

```text
send_http_request(request) -> response
```

第二阶段解决：

- 浏览器 CORS 限制。
- 请求 timeout。
- redirect 策略。
- 系统代理或用户指定代理。
- TLS 证书策略。
- 二进制响应。
- multipart/form-data。
- cookie jar。

插件侧保留同一套 `RequestEditor` 和 `ResponseViewer`，只把 `FetchTransport` 替换为 `NativeHttpTransport`。native HTTP 需要单独设计权限、输入限制、错误归一化和安全边界。

## Third Phase File-Based Collections

第三阶段参考 Bruno，把 Collection 和 Environment 导出为可放进项目仓库的文件：

```text
api-lab/
  environments/
    local.json
    dev.json
    prod.json
  collections/
    user-api.json
    admin-api.json
```

这一阶段需要 DevLauncher 提供受控文件选择和目录读写能力。第一版只保留导入导出 JSON，为文件化迁移预留数据版本。

## Error Handling

- CORS 失败：提示“浏览器限制可能阻止了该请求，后续 native HTTP 阶段会解决这类问题。”
- URL 为空或非法：阻止发送并标记 URL 输入。
- 环境变量缺失：列出缺失变量名，不发送请求。
- JSON body 格式化失败：显示解析错误，不修改用户输入。
- 网络失败：展示归一化错误和原始 message。
- 超时：第一版用 AbortController 实现前端超时提示。
- 导入失败：不覆盖现有数据，显示失败原因。
- localStorage 写入失败：提示用户导出备份或清理本地数据。

## Testing And Verification

功能验证：

- GET 请求可成功展示 status、耗时、headers 和 body。
- POST JSON 请求 body 正确发送。
- Query key/value 能同步到 URL。
- Headers enabled/disabled 生效。
- `{{baseUrl}}` 和 `{{token}}` 能正确替换。
- 缺失变量会阻止发送并展示变量名。
- Collection 保存、加载、复制、删除正常。
- History 保留最近请求并可恢复。
- 导出 JSON 后重新导入能恢复环境和集合。
- 非 JSON 响应按文本展示。
- CORS 或网络失败有清晰错误。

集成验证：

- `plugin.json` 通过当前 manifest 校验。
- 本地 zip 安装成功。
- 市场刷新后能看到 API Lab。
- 安装后启动器搜索可打开插件窗口。
- 窄窗口下左侧面板、请求编辑器和响应区域不溢出。

## Implementation Plan

1. 新增 `examples/plugins/api-lab` 静态插件包。
2. 实现单文件 `dist/index.html`，包含样式、状态管理和请求逻辑。
3. 编写插件 README，说明第一版 CORS 限制和功能范围。
4. 生成 `api-lab-1.0.0.zip`。
5. 更新 marketplace 图标、说明和 `marketplace.json`。
6. 执行功能验证和市场安装验证。
7. 根据实际 CORS 和代理痛点，另起 spec 设计 native HTTP 能力。

## Decision Check

本设计选择“先插件后内置能力”，因为 API Lab 的 UI 和工作流可以独立验证；真正需要进入主应用的是跨插件可复用的 HTTP 发送能力，而不是把整个 API Client 立即并入 DevLauncher 核心。这样第一版更小，后续演进路径也更清楚。
