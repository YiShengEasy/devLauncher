# DevLauncher 快捷记忆自定义数据设计

日期：2026-06-17

## 设计结论

快捷记忆采用“内置默认数据 + 用户自定义数据”的方案。

现有 Linux、Git、VS Code、Docker、Node 等内置类别和条目继续保留在前端源码中，作为只读默认速查库。用户新增的类别、命令、说明、标签、排序和复制次数保存到 Tauri 应用数据目录中的 JSON 文件。前端启动时合并内置数据和用户数据，保存时只写用户数据，不修改内置数组。

这样可以保持现有速查体验，同时支持用户扩展自己的命令库，并避免后续升级内置记忆时覆盖用户内容。

## 当前前提

当前快捷记忆实现集中在：

- `app/src/builtins/quickmemory/App.tsx`
- `app/src/builtins/quickmemory/manifest.ts`
- `app/src-tauri/src/builtins/quickmemory.rs`
- `app/src-tauri/src/lib.rs`

现状：

- 类别和条目硬编码在 `App.tsx` 的 `CATEGORIES` 和 `MEMORY_ITEMS` 中。
- 复制次数和排序状态保存到 `localStorage`。
- Tauri 后端只提供 `toggle_quickmemory_window` 窗口开关命令。
- 仓库已有 TOTP、远程桌面等 JSON 持久化模式，可复用 `app_data_dir` 保存应用数据。

## 目标

本次功能要让快捷记忆成为可管理的个人命令库：

- 支持新增、编辑、删除自定义类别。
- 支持在类别下新增、编辑、删除自定义条目。
- 条目支持标题、命令或快捷键内容、说明、类型、标签、置顶。
- 搜索继续命中标题、内容、说明、类型和标签。
- 复制、拖拽排序和置顶体验继续保留。
- 用户数据重启后仍然存在。

## 非目标

本次不做：

- 云同步。
- 多设备账户体系。
- 导入导出。
- 编辑内置条目。
- 删除内置类别。
- 为每个类别自定义复杂图标系统。
- 命令执行能力；快捷记忆仍然只负责速查和复制。

## 数据模型

新增一个用户数据文件，例如 `quickmemory_data.json`，保存在 Tauri `app_data_dir`。

建议结构：

```json
{
  "customCategories": [],
  "customItems": [],
  "order": {},
  "copyCounts": {}
}
```

### 自定义类别

自定义类别字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 代码生成的稳定 id |
| `name` | string | 类别名称 |
| `subtitle` | string | 类别说明 |
| `accent` | string | 类别强调色 |
| `createdAt` | string | ISO 时间 |
| `updatedAt` | string | ISO 时间 |

内置类别仍由源码提供，不写入 `customCategories`。

### 自定义条目

自定义条目字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 代码生成的稳定 id |
| `category` | string | 所属类别 id，可指向内置或自定义类别 |
| `title` | string | 条目标题 |
| `value` | string | 命令行或快捷键文本 |
| `detail` | string | 使用说明 |
| `kind` | `"command" \| "shortcut"` | 条目类型 |
| `tags` | string[] | 标签 |
| `priority` | boolean | 是否置顶 |
| `createdAt` | string | ISO 时间 |
| `updatedAt` | string | ISO 时间 |

内置条目仍由源码提供，不写入 `customItems`。

### 排序与复制次数

`order` 使用类别 id 到条目 id 数组的映射，兼容内置条目和自定义条目：

```json
{
  "order": {
    "linux": ["linux-pwd", "custom-abc"]
  }
}
```

加载时如果排序引用了不存在的条目，自动忽略该 id。这样删除自定义条目或升级内置条目后，排序数据不会导致页面异常。

`copyCounts` 使用条目 id 到次数的映射。复制次数从现有 `localStorage` 迁移到 JSON，减少状态分散。

## Tauri 后端

`quickmemory.rs` 增加数据结构和两个命令：

- `load_quickmemory_data(app) -> QuickMemoryData`
- `save_quickmemory_data(app, data: QuickMemoryData) -> Result<(), String>`

保存路径使用：

```text
app.path().app_data_dir()/quickmemory_data.json
```

加载规则：

- 文件不存在时返回空用户数据。
- 文件存在但无法读取或解析时返回错误。
- 解析失败不覆盖原文件。

保存规则：

- 保存前确保父目录存在。
- 使用 `serde_json::to_string_pretty` 写入。
- 只保存用户数据和用户状态，不保存内置类别和内置条目。

`lib.rs` 需要把两个新命令注册到 `invoke_handler`。

## 前端架构

建议把当前 `App.tsx` 中的数据和纯逻辑拆小：

```text
quickmemory/
  App.tsx
  data.ts
  storage.ts
  model.ts
  quickmemory.test.ts
```

职责：

- `model.ts`：类型定义。
- `data.ts`：内置类别、内置条目和合并逻辑。
- `storage.ts`：Tauri invoke、localStorage 迁移和保存封装。
- `App.tsx`：界面状态、交互和渲染。
- `quickmemory.test.ts`：合并、排序清理、标签解析等纯逻辑测试。

如果实现时拆分成本过高，可以先只抽出 `model.ts` 和 `data.ts`，但不要继续把新增持久化和表单逻辑全部堆进一个超大组件。

## 界面交互

保持当前速查窗口作为主体验。

类别栏：

- 增加“新增类别”入口。
- 自定义类别显示编辑和删除入口。
- 内置类别不允许删除。
- 删除自定义类别时二次确认，并删除该类别下的自定义条目。

条目区域：

- 增加“新增记忆”按钮，默认归属当前类别。
- 自定义条目显示编辑和删除入口。
- 内置条目只读，仍可复制和拖拽排序。
- 点击卡片继续复制 `value`。
- 拖拽排序继续可用，排序写入 JSON。

表单：

- 使用弹窗表单，不占用速查网格空间。
- 类别表单包含名称、说明、强调色。
- 条目表单包含标题、内容、说明、类型、标签、置顶。
- 标签输入支持逗号或空格分隔，保存时去空白、去重复。

## 验证与错误处理

保存前校验：

- 类别名称不能为空。
- 条目标题不能为空。
- 条目内容不能为空。
- 标签去掉空白项和重复项。
- id 由代码生成，不允许用户手动输入。

运行时错误处理：

- 加载失败时显示错误提示，不覆盖原 JSON 文件。
- 保存失败时保留当前界面状态，并提示用户重试。
- 删除类别时必须二次确认。
- 删除条目后清理排序中对应 id。

## 测试计划

前端单元测试覆盖：

- 内置数据与自定义数据合并。
- 自定义类别和条目归属。
- 标签解析与去重。
- 排序清理不存在的条目 id。
- 搜索命中标题、内容、说明和标签。

构建验证：

- 在 `app` 目录运行 `npm test`。
- 在 `app` 目录运行 `npm run build`。

手动验证：

1. 新增自定义类别。
2. 在自定义类别下新增命令。
3. 在内置类别下新增自定义命令。
4. 编辑自定义条目。
5. 删除自定义条目。
6. 删除自定义类别并确认其自定义条目被删除。
7. 搜索标签能命中条目。
8. 点击复制后复制次数增加。
9. 拖拽排序后关闭并重开窗口，顺序仍然保持。

## 实施边界

本设计只进入实现计划，不直接编码。实现阶段应优先做数据持久化和纯逻辑测试，再接入界面表单。每一步都应保持内置数据可正常显示，避免因为用户 JSON 异常导致快捷记忆窗口不可用。
