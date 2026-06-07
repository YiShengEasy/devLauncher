---
applyTo: "app/**"
---

# DevLauncher 项目编码规范

## 项目架构速查

```
dev-launcher/
├── app/                          # Tauri 应用根目录
│   ├── src/                      # React 前端
│   │   ├── main.tsx              # 入口，无 StrictMode
│   │   ├── App.tsx               # 主组件：全局快捷键、Tab切换、模态控制
│   │   ├── types/actions.ts      # ★ 所有 Action 类型定义（唯一真相来源）
│   │   ├── store/useKeyboardStore.ts  # Zustand store（含 showClipboard）
│   │   ├── api/config.ts         # load/save config（Rust ↔ 前端格式转换）
│   │   ├── components/
│   │   │   ├── KeyCell.tsx       # 单键渲染（68px）
│   │   │   ├── KeyboardPanel.tsx # 键盘布局（4行）
│   │   │   ├── ActionIcon.tsx    # 类型图标（SVG）
│   │   │   ├── BindingModal.tsx  # 绑定弹窗（所有 ActionType tab）
│   │   │   └── ClipboardPanel.tsx # 内置剪切板历史面板
│   │   └── index.css             # glass 样式，transparent background
│   └── src-tauri/
│       ├── src/lib.rs            # ★ Rust 命令、托盘、剪切板轮询
│       ├── Cargo.toml            # 依赖：tauri/dialog/global-shortcut/arboard
│       ├── tauri.conf.json       # 窗口：860×480, transparent, decorations:false
│       └── capabilities/default.json  # 权限白名单
```

---

## 1. 新增 Action 类型

**需要改动的文件（按顺序）：**

### `src/types/actions.ts`
```typescript
// 1. 扩展联合类型
export type ActionType = "app" | "folder" | ... | "你的新类型";

// 2. 定义 interface（继承 ActionBase）
export interface MyAction extends ActionBase {
  type: "你的新类型";
  // ...字段
}

// 3. 加入 Action 联合类型
export type Action = AppAction | ... | MyAction;

// 4. 加入 ACTION_TYPE_META（颜色必填）
export const ACTION_TYPE_META: Record<ActionType, { label: string; color: string; bg: string }> = {
  // ...
  你的新类型: { label: "显示名", color: "#hex", bg: "rgba(...)" },
};
```

### `src/components/ActionIcon.tsx`
```typescript
// 1. 新增 SVG 图标函数 IconXxx()
// 2. 加入 TYPE_ICONS 映射
// 3. 若需要特殊渲染，在 ActionIcon 组件内加 if (action.type === "xxx") 分支
//    注意：system/builtin 走 SVG 居中渲染；其他类型走字母头像
```

### `src/components/BindingModal.tsx`
```typescript
// 1. TABS 数组加入新类型
// 2. useState 中加对应字段
// 3. handleSave switch 加 case
// 4. 表单区加对应 JSX（条件渲染 activeType === "xxx"）
```

### `src-tauri/src/lib.rs`
```rust
// 1. Action enum 加新变体（注意 serde 字段名与前端一致）
MyType { name: String, field: String },

// 2. execute_action match 加对应处理
"mytype" => { /* 执行逻辑 */ }
```

---

## 2. 新增内置功能（builtin feature）

**最小改动路径：**

1. **`src/types/actions.ts`** — `BuiltinFeature` 联合类型加新值，`BUILTIN_FEATURES` 记录加元数据
2. **`src/components/BindingModal.tsx`** — builtin tab 的 grid 自动渲染（无需改）
3. **`src/App.tsx`** — `handleKeyClick` 和全局快捷键回调里加 `else if (b.feature === "xxx")` 分支
4. **新建 `src/components/XxxPanel.tsx`** — 参考 `ClipboardPanel.tsx` 结构（overlay + 面板 + Esc关闭）
5. **`src/store/useKeyboardStore.ts`** — 若面板需全局状态，加 `showXxx + setShowXxx`（模式同 showClipboard）

**Rust 后台服务（如需）：**
- 在 `lib.rs` 里新增 State struct + tauri::command
- `run()` 的 `.setup()` 里 `app.manage()` 注册状态，spawn 后台线程
- `invoke_handler` 注册新命令

---

## 3. 修改键盘 UI / 布局

| 文件 | 职责 |
|------|------|
| `KeyCell.tsx` | 单键外观（KEY_SIZE=68px，bound/unbound 两套渲染） |
| `KeyboardPanel.tsx` | 4行布局，stagger padding `[0,0,18,28]px`，gap 7px |
| `types/actions.ts` | `KEY_ROWS` 定义键位分布（改这里影响全局） |

**关键约束：**
- 窗口固定 860×480，键盘区不要超出
- 颜色使用 `ACTION_TYPE_META[type].bg` / `.color`，不要硬编码
- Bound 键：彩色背景 + 字母头像 + 右上角类型缩写 + 左上角键位ID

---

## 4. Zustand Store 使用规则

```typescript
// ✅ React 组件内 —— 直接解构
const { config, setShowClipboard } = useKeyboardStore();

// ✅ 异步回调 / 全局快捷键回调 / effect cleanup —— 用 getState()
useKeyboardStore.getState().setShowClipboard(true);

// ✅ 需要最新值的 effect（避免闭包陷阱）
const state = useKeyboardStore.getState();
```

**Store 字段一览：**
- `config: KeyboardConfig | null` — 页面+按键配置
- `activePageIndex: number` — 当前激活页
- `showClipboard: boolean` — 剪切板面板开关（必须在 store，全局快捷键回调用）
- `addPage / renamePage / removePage` — 页面管理（操作后调 `persistConfig()`）
- `bindKey` — 修改按键绑定

---

## 5. 全局快捷键规范

**快捷键格式：** `Alt+KeyQ`、`Alt+Digit1`（函数 `keyIdToShortcut` 转换）

**注册时机：** `config` 或 `activePageIndex` 变化时，effect 重新注册

**防重复注册必须做：**
```typescript
let cancelled = false;
const setup = async () => {
  await unregisterAll();
  if (cancelled) return;         // ← 必须检查
  for (const [...]) {
    if (cancelled) break;        // ← 循环内也要检查
    // ...
  }
};
return () => { cancelled = true; unregisterAll().catch(()=>{}); };
```

**Builtin action 的回调写法（顺序不能错）：**
```typescript
// ① 先设状态（同步）
useKeyboardStore.getState().setShowClipboard(true);
// ② 后操作窗口（fire-and-forget）
win.show().catch(() => {});
win.setFocus().catch(() => {});
```

---

## 6. Rust 命令规范

```rust
// 命令签名
#[tauri::command]
fn my_command(app: AppHandle, param: String) -> Result<ReturnType, String> {
    // 错误用 map_err(|e| e.to_string()) 转 String
}

// 注册（invoke_handler 里）
tauri::generate_handler![..., my_command]

// 权限（capabilities/default.json）
"core:default"  // 已包含基础权限
// 插件权限格式："{plugin}:allow-{action}"
```

**当前 Rust 命令清单：**
- `load_config` / `save_config` / `get_config_path`
- `execute_action` — 执行所有 ActionType
- `get_clipboard_history` / `set_clipboard_text` / `clear_clipboard_history`

**State 管理（多线程共享）：**
```rust
pub struct MyState { pub data: Arc<Mutex<Vec<String>>> }
// setup() 里 app.manage(MyState { data: Arc::clone(&data) });
// 命令里 state: tauri::State<'_, MyState>
```

---

## 7. 配置文件格式

**路径：** `C:\Users\{user}\AppData\Roaming\com.yisheng.app\keyboard.yaml`

**YAML 结构（Rust 序列化格式，扁平 keys）：**
```yaml
pages:
- name: 开发
  keys:
    Q:
      type: app
      name: VSCode
      target: "C:\\Program Files\\Microsoft VS Code\\Code.exe"
    B:
      type: builtin
      name: 剪切板历史
      feature: clipboard
```

**前端格式（loadConfig 转换后）：**
```typescript
{ pages: [{ name: "开发", keys: { Q: { action: { type: "app", ... } } } }] }
// keys 多一层 { action: ... } 包装
```

---

## 8. 开发命令

```powershell
cd D:\goworkspace\src\aidk\dev-launcher\app
npm run tauri dev     # 启动开发服务器（首次编译 ~2min，热重载 ~13s）
npx tsc --noEmit      # TypeScript 类型检查
```

**重编 Rust 触发条件：** 修改 `src-tauri/` 下任意文件（含 `Cargo.toml`、`lib.rs`、`tauri.conf.json`）

**仅热重载（无需重编）：** 修改 `src/` 下前端文件
