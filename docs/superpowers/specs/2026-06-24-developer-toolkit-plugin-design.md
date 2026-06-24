# Developer Toolkit Plugin Design

日期：2026-06-24

## Design Conclusion

DevLauncher 第一批实用市场插件采用一个静态 WebView 插件：`Developer Toolkit`。插件把开发者最高频、低权限、纯前端可完成的小工具集中在一个紧凑工具窗里，包括时间戳、编码与哈希、正则测试、Cron 表达式和二维码生成。

第一版不新增 Tauri 原生权限，不读取文件，不执行脚本，不读取或监听系统剪贴板，也不依赖远程服务。这样可以验证插件市场的真实使用价值，同时保持和当前静态插件安全边界一致。

## Goals

- 交付一个可安装、可搜索、可打开的 DevLauncher 市场插件。
- 使用现有 `plugin.json + dist/index.html` 静态 WebView 插件格式。
- UI 风格和当前 DevLauncher 工具窗保持一致：深色半透明面板、紧凑控件、小圆角、低装饰、少解释文案。
- 覆盖开发者高频工具：时间戳、Base64、URL 编解码、哈希、JWT 解码、正则测试、Cron 预览、二维码生成。
- 插件包可从本地 zip 安装，也可加入 `marketplace/marketplace.json`。
- 保持第一版完全离线可用，除非用户输入的二维码内容本身是 URL。

## Non-Goals

- 不实现 OCR、二维码图片识别、图片拖拽、文件读取或批处理。
- 不实现系统剪贴板读取、自动粘贴或剪贴板监听。
- 不执行 shell、Python、Node 或其他本地脚本。
- 不接入 OpenAI、翻译、TinyPNG 或其他网络服务。
- 不直接移植 ZTools 源码；只参考公开工具类型和交互思路，按 DevLauncher 插件格式重新实现。
- 不把现有内置 JSON 工具迁移到插件里。

## Plugin Identity

插件包放在示例和市场目录中：

```text
examples/plugins/developer-toolkit/
  plugin.json
  icon.svg
  README.md
  dist/
    index.html

marketplace/plugins/developer-toolkit/
  README.md

marketplace/icons/developer-toolkit.svg
```

Manifest：

```json
{
  "id": "devlauncher.tools.developer-toolkit",
  "name": "Developer Toolkit",
  "version": "1.0.0",
  "kind": "webview",
  "description": "时间戳、编码、哈希、正则、Cron 和二维码工具箱。",
  "entry": "dist/index.html",
  "icon": "icon.svg",
  "actions": [
    {
      "id": "open",
      "title": "打开开发者工具箱",
      "type": "webview"
    }
  ]
}
```

启动器关键词来自动作标题和插件元数据。第一版不扩展 manifest schema；如果后续需要更多关键词，再单独设计 `keywords` 字段。

## Tool Scope

### Timestamp

- 显示当前本地时间、Unix 秒、Unix 毫秒和 ISO 字符串。
- 输入秒、毫秒、ISO 或常见日期时间字符串，输出本地时间、UTC/ISO、Unix 秒和 Unix 毫秒。
- 提供 `现在`、`解析`、`清空`、`复制结果`。

### Codec And Hash

- Base64 encode/decode。
- URL encode/decode。
- MD5、SHA-1、SHA-256 文本哈希。
- JWT decode：解析 header 和 payload，不校验签名。
- 输入为空时输出区显示空状态，不弹窗。

### Regex

- 输入正则表达式、flags 和测试文本。
- 输出匹配数量、每条匹配的 range 和 captures。
- 支持常见 flags：`g`、`i`、`m`、`s`、`u`。
- 正则错误展示在结果区，保持页面可继续编辑。

### Cron

- 支持 5 段 Unix cron：`minute hour day month weekday`。
- 解释基础字段：通配、列表、范围、步进。
- 预览从当前时间起的下 5 次执行时间。
- 第一版不支持 Quartz 秒字段或复杂别名；遇到不支持语法时展示明确提示。

### QR Code

- 输入文本或 URL，生成二维码。
- 提供尺寸档位和纠错等级。
- 支持下载 PNG。
- 第一版不识别图片二维码，因为当前静态插件没有图片输入和文件访问能力。

## UI Design

插件使用单页工具界面，不做 landing page。

整体布局：

```text
+--------------------------------------------------+
| Developer Toolkit                         status |
| [Timestamp] [Codec] [Regex] [Cron] [QRCode]      |
|--------------------------------------------------|
| tool-specific compact controls                   |
|                                                  |
| left input area          right output area        |
|                                                  |
| footer actions / inline errors                   |
+--------------------------------------------------+
```

视觉规则：

- 背景使用 `#101116` 到 `#171923` 一类深色，不使用大面积紫蓝渐变。
- 面板使用 `rgba(255,255,255,0.035)` 到 `0.07` 的半透明层次。
- 边框使用 `rgba(255,255,255,0.10)` 到 `0.14`。
- 控件圆角保持 7px 到 8px，外层面板不超过 10px。
- 文本主色接近 `#e8eaf0`，辅助色使用 `rgba(255,255,255,0.55)`。
- 字号以 11px 到 13px 为主，代码输入输出使用等宽字体。
- 所有按钮为短命令文本：`复制`、`清空`、`解析`、`生成`、`下载`。
- 不使用介绍性大段文案，不使用嵌套卡片。

响应式规则：

- 插件窗口宽度不足时，输入和输出上下排列。
- tab 保持横向可滚动，不压缩文字到不可读。
- 输出区设置稳定最小高度，错误和空状态不导致布局跳动。

## Implementation Boundary

插件页面只使用浏览器标准 API：

- `crypto.subtle` 用于 SHA-1 和 SHA-256。
- 小型内联实现或轻量本地脚本用于 MD5、Cron 预览和二维码生成。
- `Blob` 和 object URL 用于二维码 PNG 下载。
- `navigator.clipboard.writeText` 用于用户主动点击后的复制；不可用时提示用户手动选择结果。
- `localStorage` 只保存最近使用的 tab 和用户选择的二维码设置。

不调用 Tauri invoke，不访问 Node API，不依赖 CDN。所有脚本和样式打进 `dist/index.html`，避免静态插件资源路径和 CSP 问题。

## Packaging And Marketplace

新增本地示例插件后，用现有插件包约束生成 zip：

```text
developer-toolkit-1.0.0.zip
  plugin.json
  icon.svg
  README.md
  dist/
    index.html
```

发布到市场时更新：

- `marketplace/releases/developer-toolkit-1.0.0.zip`
- `marketplace/icons/developer-toolkit.svg`
- `marketplace/plugins/developer-toolkit/README.md`
- `marketplace/marketplace.json`

`marketplace.json` 中写入 zip 的 `sha256`，确保市场安装链路可以校验。

## Error Handling

- 输入解析错误显示在当前 tab 的输出区或底部状态，不使用阻塞弹窗。
- 不支持的 Cron 表达式给出简短原因。
- JWT 非三段格式时提示 `JWT must have header.payload.signature`。
- Base64 decode 失败时保留原输入，不清空用户内容。
- 二维码内容为空时禁用生成和下载动作。

## Testing And Verification

功能验证：

- 时间戳秒、毫秒、ISO、本地日期字符串互转。
- Base64、URL、MD5、SHA-1、SHA-256 输出稳定。
- JWT decode 能解析合法 token，非法 token 有错误提示。
- Regex 能显示匹配和 captures，错误表达式不崩溃。
- Cron 能预览基础表达式，例如 `*/5 * * * *`、`0 9 * * 1-5`。
- QR Code 能生成并下载 PNG。

集成验证：

- `plugin.json` 通过当前 manifest 校验。
- 本地 zip 安装成功。
- 市场刷新后能看到 Developer Toolkit。
- 安装后启动器搜索可打开插件窗口。
- 窄窗口下 tab、按钮、输入输出区不溢出。

## Future Extensions

- 插件 API 支持 selected text 后，允许从启动器输入直接带入当前 tab。
- 插件 API 支持 clipboard read 后，增加粘贴和从剪贴板生成二维码。
- 插件 API 支持 file picker 后，增加文件 Hash、二维码识别和图片色卡。
- Manifest 支持 `keywords` 后，为每个子工具声明更细粒度搜索词。
