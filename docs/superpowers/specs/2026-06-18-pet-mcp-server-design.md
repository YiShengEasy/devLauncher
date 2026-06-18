# DevLauncher Pet MCP Server Design

日期：2026-06-18

## Design Conclusion

DevLauncher 电子宠物提供一个本地 MCP server，让 Codex 主动调用宠物工具。第一版只做状态和通知，不做聊天、任务队列或读取 Codex 私有状态。

## Architecture

```text
Codex
  |
  | MCP stdio tools
  v
mcp/devlauncher-pet-mcp.mjs
  |
  | append JSONL event
  v
DevLauncher app data / pet-mcp-events.jsonl
  |
  | Tauri poll + emit to React state
  v
PetEntryApp
```

采用文件事件信箱，而不是本地 HTTP 服务，原因是：

- 不需要监听端口。
- 不需要新增 npm 依赖。
- Codex MCP 进程和 Tauri app 可以跨进程通信。
- DevLauncher 没启动时，MCP 调用只会留下事件文件，不会崩溃。

## Tools

### pet_set_status

参数：

```text
status: idle | working | waiting | success | error | disconnected
message?: string
```

用途：Codex 在任务开始、等待确认、成功、失败时更新宠物状态。

### pet_notify

参数：

```text
message: string
level?: info | success | warning | error
```

用途：Codex 发一条短提示。第一版把 `level` 映射成宠物状态。

## Safety

- 设置中的 Codex 联动开关仍是总开关。
- 开关关闭时，DevLauncher 不消费 MCP 事件。
- MCP server 不启动 Codex，不读取 Codex 内部数据。
- 消息最长保留 60 个字符，避免宠物窗口文本溢出。

## Install Shape

第一版提供一个 Node stdio MCP server 文件：

```text
mcp/devlauncher-pet-mcp.mjs
```

Codex 配置可指向：

```text
node /path/to/devLauncher/mcp/devlauncher-pet-mcp.mjs
```

事件信箱默认路径按平台推导，也可用环境变量覆盖：

```text
DEVLAUNCHER_PET_MCP_INBOX=/path/to/pet-mcp-events.jsonl
```
