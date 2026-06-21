# DevLauncher Static WebView Plugin Market Design

日期：2026-06-21

## Design Conclusion

DevLauncher 插件市场第一版采用“静态 WebView 插件”方案。插件是一组静态前端文件和一个 `plugin.json` manifest。DevLauncher 可以从本地 zip 或远程静态市场索引下载安装插件，校验后把插件动作合并到启动器搜索，用户点击后在统一的插件 Host 窗口中打开插件页面。

第一版不支持脚本执行、Node 后端、第三方插件生态适配、开发者上传平台或任意 native 能力。这样可以先跑通市场下载、安装、启用、打开和卸载链路，同时把安全风险控制在静态资源范围内。

## Goals

- 支持静态 WebView 插件包格式。
- 支持从本地 zip 安装插件。
- 支持从远程 `marketplace.json` 下载并安装插件。
- 设置页增加插件中心，展示市场、已安装、启用、禁用、卸载状态。
- 启动器可以搜索已启用插件的动作。
- 插件动作可以打开一个本地 WebView 页面。
- 安装失败、校验失败、入口文件缺失时给出明确错误。
- 现有内置功能暂时保留现状，不在第一版拆成远程插件。

## Non-Goals

- 不执行 shell、Python、Node CLI 或任意脚本。
- 不支持插件调用系统高权限 API。
- 不支持插件间通信。
- 不支持第三方生态插件自动适配。
- 不支持开发者网页上传和审核后台。
- 不支持插件热更新后台服务。
- 不把 DevLauncher 启动或核心设置依赖到远程市场。

## Plugin Package

插件包是 zip 文件，根目录必须包含 `plugin.json`。

```text
my-plugin.zip
  plugin.json
  README.md
  icon.svg
  dist/
    index.html
    assets/
      index.js
      style.css
```

第一版插件只能声明 `kind: "webview"`。

```json
{
  "id": "devlauncher.tools.json-viewer",
  "name": "JSON Viewer",
  "version": "1.0.0",
  "kind": "webview",
  "description": "查看和格式化 JSON",
  "entry": "dist/index.html",
  "icon": "icon.svg",
  "actions": [
    {
      "id": "open",
      "title": "打开 JSON Viewer",
      "type": "webview"
    }
  ]
}
```

Manifest 约束：

- `id` 使用反向域名或稳定命名空间，只允许小写字母、数字、点和短横线。
- `version` 使用 semver。
- `kind` 第一版只接受 `webview`。
- `entry` 必须指向插件包内部的 HTML 文件。
- `actions` 至少包含一个 `type: "webview"` 的动作。
- 第一版 `permissions` 默认为空；插件不能声明或获得高权限。

## Marketplace Index

第一版市场使用静态 JSON，可以托管在 GitHub Pages、GitHub Release、对象存储或普通 HTTPS 地址。

```json
{
  "version": 1,
  "plugins": [
    {
      "id": "devlauncher.tools.json-viewer",
      "name": "JSON Viewer",
      "version": "1.0.0",
      "kind": "webview",
      "description": "查看和格式化 JSON",
      "downloadUrl": "https://example.com/plugins/json-viewer-1.0.0.zip",
      "sha256": "hex encoded sha256",
      "icon": "https://example.com/icons/json-viewer.svg"
    }
  ]
}
```

市场索引只负责发现和下载。是否启用、绑定快捷键、最近使用记录等用户状态保存在本机配置里。

## Install Location

插件安装到应用数据目录，不写入仓库目录。

```text
Application Support/devLauncher/plugins/
  installed.json
  devlauncher.tools.json-viewer/
    1.0.0/
      plugin.json
      README.md
      icon.svg
      dist/
        index.html
```

`installed.json` 记录本机安装状态：

```json
{
  "plugins": [
    {
      "id": "devlauncher.tools.json-viewer",
      "version": "1.0.0",
      "enabled": true,
      "source": "market",
      "installedAt": 1782030000000
    }
  ]
}
```

卸载时删除插件版本目录，并从 `installed.json` 移除记录。禁用时只修改 `enabled`，保留插件文件。

## App Architecture

```text
Marketplace JSON
  |
  | fetch + download zip
  v
Tauri plugin manager
  |
  | sha256 + manifest validation + unzip
  v
App data plugins directory
  |
  | list installed manifests
  v
React plugin registry
  |
  | merge enabled plugin actions
  v
Launcher search
  |
  | open plugin action
  v
Plugin Host window
```

新增模块边界：

- `plugin_manager`：Tauri 侧插件下载、校验、解压、启用、禁用、卸载。
- `plugin_manifest`：Rust/TypeScript 共享语义的 manifest 类型和校验规则。
- `pluginRegistry`：前端读取已安装插件，生成启动器动作。
- `PluginCenter`：设置页中的插件中心 UI。
- `PluginHostApp`：统一承载静态 WebView 插件页面。

## Launcher Integration

现有动作系统里增加 `plugin` 类型。

```ts
interface PluginAction {
  type: "plugin";
  name: string;
  pluginId: string;
  actionId: string;
}
```

启动器索引合并三类记录：

- 键盘绑定动作。
- 现有内置功能。
- 已启用插件动作。

执行插件动作时，前端调用 Tauri：

```text
open_plugin_window(pluginId, actionId)
```

Tauri 根据已安装 manifest 找到插件入口文件，打开或聚焦统一的插件 Host 窗口，并把插件入口路径传给前端。

## Plugin Host

第一版使用一个统一窗口承载插件页面。Host 负责：

- 根据 `pluginId` 和 `actionId` 找到入口。
- 加载插件本地 HTML。
- 显示加载失败、入口缺失、插件已禁用等错误状态。
- 限制插件默认能力，不注入系统 API。

第一版插件页面可以使用浏览器标准能力和静态资源，但不提供 shell、文件系统、凭据、窗口管理等 DevLauncher API。

## Plugin Center UI

插件中心放在设置页内，第一版包含三个视图：

- 市场：从 `marketplace.json` 展示可安装插件。
- 已安装：展示已安装插件，支持启用、禁用、卸载、打开。
- 本地安装：选择本地 zip，校验后安装。

每个插件展示：

- 图标、名称、版本、描述。
- 来源：market 或 local。
- 状态：未安装、已安装、已启用、已禁用、可更新。
- 安装失败或校验失败的短错误。

## Safety

- 只允许 HTTPS 远程下载，除非用户明确选择本地 zip。
- 远程安装必须校验 `sha256`。
- 解压时拒绝路径穿越，例如 `../` 或绝对路径。
- 入口文件必须在插件安装目录内。
- 第一版不执行插件脚本和 native 代码。
- 第一版不注入高权限 API。
- 禁用插件后，启动器不显示该插件动作。
- 市场请求失败不能影响 DevLauncher 启动。

## Error Handling

- 市场 JSON 无法加载：插件中心显示市场不可用，已安装插件仍可使用。
- 下载失败：保留当前状态，不写入 `installed.json`。
- `sha256` 不匹配：拒绝安装，删除临时文件。
- zip 解压失败：拒绝安装，清理临时目录。
- manifest 不合法：拒绝安装，展示具体字段错误。
- 入口文件不存在：拒绝安装。
- 插件打开失败：Host 显示错误，不影响主窗口和启动器。

## Testing

单元测试：

- manifest 校验规则。
- 市场索引解析。
- 插件动作合并到启动器索引。
- 禁用插件后不进入搜索结果。
- `plugin` 动作执行调用正确 Tauri command。

集成测试或手动验证：

- 本地 zip 安装成功。
- market JSON 安装成功。
- sha256 错误时安装失败。
- 路径穿越 zip 被拒绝。
- 安装后启动器能搜索并打开插件。
- 禁用后启动器不再出现插件动作。
- 卸载后插件文件和安装记录被清理。

## First MVP Scope

第一版完成后，应能演示：

1. 准备一个 `hello-plugin.zip`，包含 `plugin.json` 和 `dist/index.html`。
2. 在插件中心从本地 zip 安装。
3. 插件出现在已安装列表。
4. 插件动作出现在启动器搜索。
5. 点击动作后打开插件页面。
6. 禁用插件后，启动器不再显示它。
7. 卸载插件后，安装目录被清理。
8. 使用静态 `marketplace.json` 下载并安装同一个插件。

## Later Extensions

后续可以在这个基础上继续扩展：

- 脚本插件和权限确认。
- 宠物资源包和主题包。
- MCP 插件包。
- 开发者插件模板和打包 CLI。
- GitHub PR 模式插件市场。
- 插件签名和官方认证。
- 内置功能转为 bundled plugin，并允许市场版本覆盖。
