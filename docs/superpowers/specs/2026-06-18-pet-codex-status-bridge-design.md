# DevLauncher Pet Codex Status Bridge Design

日期：2026-06-18

## Design Conclusion

第一版 Codex 联动采用“可关闭的状态桥”方案。电子宠物不直接启动或依赖 Codex；用户在设置中开启联动后，DevLauncher 才接受 Codex 状态事件并在宠物上显示工作、等待、成功、失败等轻量状态。

## Goals

- 设置页提供 Codex 联动开关，默认关闭。
- 未安装 Codex 或未启动 Codex 时，DevLauncher 和宠物都不能异常退出。
- 宠物保留现有四角快捷入口。
- 联动只显示状态和短消息，不做完整聊天窗口。
- 提供稳定的状态事件边界，后续 Codex wrapper 或内部任务都可以接入。

## Status Model

状态集合：

- `idle`: 空闲
- `working`: 正在执行或思考
- `waiting`: 等待用户确认或输入
- `success`: 任务完成
- `error`: 任务失败
- `disconnected`: 联动开启但未连接到 Codex

状态事件 payload:

```text
{ status: PetCodexStatus, message?: string }
```

旧的 `pet-action-state` 仍保留给宠物精灵动作使用。

## Settings Safety

配置新增：

```text
pet.codex.enabled: boolean
```

默认值是 `false`。关闭时，宠物忽略 Codex 状态事件，并显示原有待机状态。开启后，如果没有外部状态事件，宠物显示 `disconnected`，表示联动已开启但尚未连接。

## Implementation Boundary

本次只实现：

- 配置类型与持久化。
- 设置页开关。
- 宠物 Codex 状态显示。
- Tauri 状态事件命令。
- 单元测试覆盖默认配置和状态归一化。

本次不实现：

- 自动启动 Codex。
- 探测 Codex 私有运行状态。
- AI 对话输入框。
- 任务队列。
