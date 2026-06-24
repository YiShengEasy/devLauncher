# Writing And Code Toolkit Plugin Design

日期：2026-06-24

## Design Conclusion

DevLauncher 第二批实用市场插件采用一个静态 WebView 插件：`Writing & Code Toolkit`。插件把文本对比、Markdown 预览、代码截图和代码片段四类高频写作/开发辅助能力集中在一个紧凑工具窗里。

第一版继续保持纯 WebView 插件边界：不新增 Tauri 原生权限，不读写本地文件，不读取或监听系统剪贴板，不执行脚本，不依赖 CDN 或远程服务。所有能力都在插件页面内完成。

## Goals

- 交付一个可安装、可搜索、可打开的 DevLauncher 市场插件。
- 使用现有 `plugin.json + dist/index.html` 静态 WebView 插件格式。
- UI 风格与 DevLauncher 当前工具窗一致：深色、紧凑、小圆角、半透明面板、少解释文案。
- 覆盖四个高频工具：文本 Diff、Markdown 预览、代码截图、代码片段。
- 插件包可从本地 zip 安装，也可通过 `marketplace/marketplace.json` 安装。
- 在 sandbox iframe 中可运行；页面存储不可用时功能仍可临时使用。

## Non-Goals

- 不读取文件或拖拽文件。
- 不保存截图到指定系统路径，只通过浏览器下载机制下载 PNG。
- 不读取剪贴板，不自动粘贴。
- 不支持 Mermaid、数学公式、外部 Markdown 插件或远程代码高亮服务。
- 不实现完整 IDE 级 snippet 管理、同步或搜索索引。
- 不改变插件 Host 的 sandbox 权限。

## Plugin Identity

```json
{
  "id": "devlauncher.tools.writing-code-toolkit",
  "name": "Writing & Code Toolkit",
  "version": "1.0.0",
  "kind": "webview",
  "description": "文本对比、Markdown 预览、代码截图和代码片段工具箱。",
  "entry": "dist/index.html",
  "icon": "icon.svg",
  "actions": [
    {
      "id": "open",
      "title": "打开写作与代码工具箱",
      "type": "webview"
    }
  ]
}
```

## Tool Scope

### Diff

- 左右两个文本输入区。
- 行级 LCS diff，输出新增、删除、相同三类行。
- 显示统计：added、removed、unchanged。
- 支持复制 diff 文本。

### Markdown

- Markdown 输入区和实时预览区。
- 支持标题、粗体、斜体、行内代码、代码块、链接、引用、有序/无序列表和段落。
- 支持复制渲染 HTML 和纯文本预览。
- 渲染输出必须进行 HTML escaping，避免输入注入脚本。

### Code Screenshot

- 代码输入区、语言名称、主题、字号、圆角和 padding 控件。
- 生成一个 styled code card。
- 支持下载 PNG：使用 SVG `foreignObject` 转 canvas 的浏览器下载路径。
- 不调用系统截图，也不读取本地文件。

### Snippets

- 片段标题、语言、正文输入。
- 列表展示当前片段，可插入到代码截图工具或复制。
- 使用 `localStorage` 保存；如果 sandbox 禁用存储，则保持内存态并提示“本次会话有效”。
- 支持新增、更新、删除和导入内置示例。

## UI Design

插件使用单页工具界面，不做 landing page。

```text
+--------------------------------------------------+
| Writing & Code Toolkit                    status |
| [Diff] [Markdown] [Code Shot] [Snippets]          |
|--------------------------------------------------|
| compact controls                                  |
| left editor/input        right preview/output     |
| footer actions / inline status                    |
+--------------------------------------------------+
```

视觉规则：

- 背景使用 `#101116` 一类深色。
- 面板使用半透明深色层次和细边框。
- 控件圆角 7px 到 8px，外层面板不超过 10px。
- 字号以 11px 到 13px 为主；代码区域使用等宽字体。
- tab 横向排列，窄宽度时可横向滚动。
- 插件窗口窄于 720px 时输入和输出上下排列。
- 不使用大段介绍文字、不使用嵌套卡片、不做宣传式 hero。

## Implementation Boundary

- 所有 HTML、CSS、JS 打包进 `dist/index.html`。
- 不调用 Tauri invoke。
- 不依赖 npm 包、CDN、外部图片或远程字体。
- 使用安全存储包装器访问 `localStorage`，捕获 sandbox 异常。
- 用户主动点击复制时使用 `navigator.clipboard.writeText`，失败时提示手动选择。

## Packaging And Marketplace

新增：

```text
examples/plugins/writing-code-toolkit/
  plugin.json
  README.md
  icon.svg
  dist/index.html

marketplace/plugins/writing-code-toolkit/README.md
marketplace/icons/writing-code-toolkit.svg
marketplace/releases/writing-code-toolkit-1.0.0.zip
```

更新 `marketplace/marketplace.json`，写入 release zip 的 SHA-256。

## Testing And Verification

- `plugin.json` 通过当前 manifest 约束。
- `dist/index.html` 脚本语法可解析。
- HTML 不包含外部 `src="http..."` 或 `href="http..."` 依赖。
- release zip 根目录包含 `plugin.json`、`README.md`、`icon.svg`、`dist/index.html`。
- `marketplace.json` 包含插件条目且 sha 与 zip 匹配。
- Chrome 本地打开可看到 tabs 和各工具界面。
- app 现有测试通过：`npm --prefix app test -- --run`。
