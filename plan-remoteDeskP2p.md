# DevLauncher — P2P 远程桌面内置功能开发计划

## 目标

在 DevLauncher 中新增 `remotedesk` 内置功能，通过三个递进阶段交付：
- **Phase 1**：RDP 连接配置管理器（快速启动 mstsc，两周内可用）
- **Phase 2**：内置 P2P 屏幕查看（局域网 JPEG over WebSocket，只读）+ 手机浏览器 Web 客户端
- **Phase 3**：公网 P2P 穿透 + 双向输入注入（完整远控，PC 与手机均可操控）

---

## 架构约束（复用现有模式）

- 独立 Tauri 窗口（`label: "remotedesk"`，`?view=remotedesk`）
- 前端 React 组件 `RemoteDeskApp.tsx`，参考 `TotpApp.tsx` 模式
- 密码统一存入 **Windows Credential Manager**（`keyring` crate，已有依赖）
- 主题：`useEffect(() => { applyThemeFromConfig(); }, [])` + `.glass` 类
- 国际化：UI 中文，代码注释英文，错误信息英文

---

## Phase 1 — RDP 连接配置管理器

### 目标
点击 remotedesk 键 → 弹出窗口 → 管理 RDP 连接 Profile → 双击自动启动 `mstsc.exe` 并填充凭据。

### 改动文件清单

**`src/types/actions.ts`**
```ts
export type BuiltinFeature = "clipboard" | "json" | "totp" | "remotedesk";

BUILTIN_FEATURES: {
  remotedesk: { name: "远程桌面", description: "RDP 连接管理与 P2P 远控", emoji: "🖥️" }
}
```

**`src-tauri/tauri.conf.json`**
```json
{
  "label": "remotedesk",
  "url": "index.html?view=remotedesk",
  "title": "DevLauncher 远程桌面",
  "width": 560,
  "height": 640,
  "resizable": true,
  "decorations": false,
  "transparent": true,
  "shadow": false,
  "alwaysOnTop": true,
  "center": true,
  "skipTaskbar": true,
  "visible": false
}
```

**`capabilities/default.json`**
- 窗口列表加 `"remotedesk"`
- 现有权限已够用（`core:window:allow-show` 等已在列表中）

**`src-tauri/src/lib.rs`**
```rust
// 新增数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteDeskProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,          // RDP 默认 3389
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_password: Option<bool>,  // 密码存 keyring，此处仅标记
}

// 新增命令
fn toggle_remotedesk_window(app: AppHandle) -> Result<(), String>
fn load_remotedesk_profiles(app: AppHandle) -> Result<Vec<RemoteDeskProfile>, String>
fn save_remotedesk_profiles(app: AppHandle, profiles: Vec<RemoteDeskProfile>) -> Result<(), String>
fn save_remotedesk_password(id: String, password: String) -> Result<(), String>  // keyring
fn delete_remotedesk_password(id: String) -> Result<(), String>                  // keyring
fn launch_rdp(app: AppHandle, id: String) -> Result<(), String>
```

**`launch_rdp` 实现逻辑（Rust）：**
1. 按 id 加载 Profile
2. 用 `keyring` 取密码
3. 如有密码，调用 `cmdkey /add:host /user:username /pass:password` 预存凭据
4. `std::process::Command::new("mstsc").args(["/v:host:port"]).spawn()`
5. 延迟 3s 后（可选）执行 `cmdkey /delete:host` 清除临时凭据

**`src/RemoteDeskApp.tsx`**（新建）
- `useEffect(() => { applyThemeFromConfig(); }, [])`
- Esc 隐藏窗口
- Profile 列表（卡片 + 图标 + host:port + 用户名）
- 添加/编辑表单：名称、主机、端口（默认 3389）、用户名、密码（存 keyring）
- 双击或"连接"按钮 → `invoke("launch_rdp", { id })`
- 删除 Profile 时同步调用 `invoke("delete_remotedesk_password", { id })`

**`src/main.tsx`**
```tsx
view === "remotedesk" ? <RemoteDeskApp /> : ...
```

**`src/App.tsx`**
- `handleKeyClick` 的 builtin 分支加：
  ```ts
  else if (b.feature === "remotedesk") {
    invoke("toggle_remotedesk_window").catch(console.error);
  }
  ```
- 全局快捷键回调同上

---

## Phase 2 — 内置 P2P 屏幕查看（局域网）

### 目标
A 机开启主机模式（屏幕捕获 + WebSocket 推流）→ B 机输入 IP:Port+PIN → canvas 显示 A 的屏幕（5-15fps JPEG，只读）。

### 新增 Cargo 依赖
```toml
scrap = "0.5"                           # Windows DXGI 屏幕捕获
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.21"              # WebSocket 服务端
enigo = "0.2"                           # 输入注入（Phase 3 用，提前引入）
```

### 新增 Rust 命令

```rust
fn start_remotedesk_host(port: Option<u16>) -> Result<HostInfo, String>
// 返回 { pin: "123456", local_ip: "192.168.x.x", port: 19090 }
// 内部启动 tokio runtime：
//   1. 生成 6 位随机 PIN
//   2. 绑定 ws://0.0.0.0:port
//   3. 握手验证 PIN
//   4. scrap 每帧捕获 → 缩放 → JPEG 压缩（quality: 60）→ base64 → ws broadcast
//   5. 帧率控制：约 10fps（100ms sleep）

fn stop_remotedesk_host() -> Result<(), String>
// 发送停止信号到捕获线程，关闭 WebSocket 服务

fn get_remotedesk_host_status() -> HostStatus
// 返回 { running: bool, connections: u32, pin: Option<String> }
```

### 前端新增（`RemoteDeskApp.tsx`）

新增两个 Tab：
- **我的设备**（主机模式）：
  - 启动/停止主机按钮
  - 显示 PIN 码 + IP:Port（供对方复制）
  - 显示 Web 客户端访问地址（`http://192.168.x.x:19090`，手机扫码或直接访问）
  - 在线连接数计数（PC 客户端 + 手机浏览器合计）
- **连接到设备**（连接端）：
  - 输入 IP:Port 和 PIN
  - 点击连接 → 前端直接通过 `new WebSocket("ws://ip:port")` 连接
  - 握手发送 PIN
  - 接收 JPEG base64 帧 → `drawImage` 到 `<canvas>`
  - 帧率/延迟显示

### 手机 Web 客户端（Phase 2 新增）

主机模式启动时，axum 同时提供 HTTP 静态服务（同端口，路由区分）：
- `GET /` → 返回内联 `client.html`（用 `include_str!("../assets/client.html")` 打包进二进制）
- `GET /ws` → WebSocket 升级端点

**`src-tauri/assets/client.html`**（新建，纯 HTML+JS，无框架）
```html
<!-- 手机浏览器远控页面 -->
<!-- 功能：PIN 登录 → WebSocket 接收 JPEG 帧 → canvas 渲染 → touch 事件映射为鼠标输入 -->
```

手机端交互设计：
- 单指拖动 → 鼠标移动（Phase 2 只读，Phase 3 启用输入）
- 单指点击 → 鼠标左键单击
- 双指捏合 → 缩放 canvas（本地缩放，不影响被控端分辨率）
- 底部浮动按钮：键盘 / 右键 / 滚轮

**axum 路由结构（`lib.rs`）：**
```rust
let app = Router::new()
    .route("/", get(serve_client_html))    // 静态 HTML
    .route("/ws", get(ws_handler));         // WebSocket 推流 + 输入接收
// tokio::spawn(axum::serve(listener, app))
```

| 客户端类型 | 支持阶段 | 连接方式 |
|------------|---------|----------|
| DevLauncher（PC） | Phase 2+ | `ws://ip:port/ws` |
| 手机浏览器（同 WiFi） | Phase 2+ | `http://ip:port` → WebSocket |
| 手机浏览器（跨公网） | Phase 3+ | 信令服务器中转 ICE，WebRTC DataChannel |

---

## Phase 3 — 公网 P2P 穿透 + 双向输入

### 目标
跨 NAT 两台机器之间实现完整远控：鼠标/键盘双向传输，无需公网服务器中转数据流。

### 方案选型

**信令服务**（必须，轻量）：
- 自建 Rust axum 信令服务器（或允许用户配置第三方 STUN/TURN）
- 功能：交换 ICE candidate，不中转媒体数据
- 可部署到 fly.io / 任意 VPS（50MB 二进制）

**P2P 穿透**：
- 引入 `str0m`（纯 Rust WebRTC 实现，无 C 依赖）
  ```toml
  str0m = "0.5"
  ```
- 替换 Phase 2 的直连 WebSocket，通过 ICE/STUN 建立 P2P DataChannel
- 媒体数据走 P2P DataChannel，帧格式不变（JPEG base64）

**输入注入**（enigo，Phase 2 已引入）：
```rust
#[derive(Deserialize)]
enum InputEvent {
    MouseMove { x: i32, y: i32 },
    MouseClick { button: MouseButton },
    KeyPress { key: String },
    KeyRelease { key: String },
}
// enigo.mouse_move_to(x, y)
// enigo.mouse_click(Button::Left, Click)
```

**前端（控制端，PC + 手机浏览器通用）**：
- PC：`<canvas>` 的 `mousemove` / `click` / `keydown` / `keyup` 事件 → 转换为 `InputEvent` → 通过 DataChannel 发送
- 手机：`touchstart` / `touchmove` / `touchend` → 映射为等效鼠标事件 → 同一 DataChannel
- 坐标缩放：canvas 尺寸 → 被控端实际分辨率（PC 和手机共享同一计算逻辑）

### 新增 Cargo 依赖（Phase 3）
```toml
str0m = "0.5"
axum = "0.7"
tokio-util = "0.7"
```

### 信令流程
```
控制端 (A)                    信令服务器              被控端 (B)
   |--- connect(room_id) -------->|                      |
   |                              |<--- connect(room_id) |
   |<--- peer_joined ------------|                       |
   |--- ice_candidate ---------->|--- ice_candidate ---->|
   |<------ ice_candidate -------|<--- ice_candidate ----|
   |========= P2P DataChannel 建立（STUN 打洞）=========|
   |<====== JPEG frames (10fps) ========================|
   |======= InputEvents ================================>|
```

---

## 文件改动汇总

| 文件 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| `src/types/actions.ts` | ✅ 加 remotedesk | — | — |
| `src-tauri/tauri.conf.json` | ✅ 加窗口 | — | — |
| `capabilities/default.json` | ✅ 加窗口 | — | — |
| `src-tauri/Cargo.toml` | — | ✅ scrap/tokio-tungstenite/enigo/axum | ✅ str0m/tokio-util |
| `src-tauri/src/lib.rs` | ✅ RDP 命令 | ✅ WS 推流 + HTTP 静态服务 | ✅ ICE/输入注入命令 |
| `src-tauri/assets/client.html` | — | ✅ 新建，手机 Web 客户端页面 | ✅ 加 touch 事件 + WebRTC |
| `src/RemoteDeskApp.tsx` | ✅ 新建，RDP 列表 | ✅ 主机/连接 tab + 二维码显示 | ✅ P2P 连接流程 |
| `src/main.tsx` | ✅ 路由 | — | — |
| `src/App.tsx` | ✅ toggle 调用 | — | — |
| 信令服务器（独立仓库） | — | — | ✅ 新建 axum 服务 |

---

## 验收标准

**Phase 1：**
- [ ] 内置菜单出现"远程桌面"图标
- [ ] 可添加 / 编辑 / 删除 RDP Profile
- [ ] 点击连接 → mstsc 弹出且已自动填充用户名（无需手动输入）
- [ ] 密码存入 Windows Credential Manager，不出现在 keyboard.yaml

**Phase 2：**
- [ ] 局域网内 A 机开启主机 → 显示 PIN + IP:Port + Web 访问地址
- [ ] B 机（DevLauncher）输入 IP:Port+PIN → canvas 渲染 A 的屏幕
- [ ] 手机浏览器访问 `http://IP:Port` → 输入 PIN → canvas 渲染 A 的屏幕
- [ ] 实测帧率 ≥ 5fps（Wi-Fi 局域网，PC 和手机均满足）
- [ ] 关闭/重新打开控制端窗口后可重连

**Phase 3：**
- [ ] 两台不同 NAT 下的机器可建立 P2P 连接（STUN 打洞成功率 > 80%）
- [ ] PC 控制端鼠标移动 → 被控端光标跟随（延迟 < 200ms，局域网 < 50ms）
- [ ] 手机浏览器 touch 操作 → 被控端对应鼠标事件正确触发
- [ ] 键盘输入正确传递（PC 物理键盘 + 手机软键盘）
- [ ] 断线后自动尝试重连 3 次

---

## 风险与依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| `scrap` crate 在 Tauri 2 + Windows 11 兼容性 | Phase 2 阻塞 | 备选：调用 `ffmpeg -f gdigrab`（外部进程） |
| STUN 打洞失败率（对称型 NAT） | Phase 3 降级 | 提供 TURN 中继作为 fallback |
| `str0m` API 不稳定（0.x） | Phase 3 实现复杂 | 备选：`webrtc-rs`（更成熟但有 C 依赖） |
| `cmdkey` 存储 RDP 凭据被安全软件拦截 | Phase 1 用户体验 | fallback：只传 host，让 mstsc 弹出密码输入框 |
| 手机浏览器不支持 `ws://`（HTTP 页面不可混合内容） | Phase 2 手机端 | 主机同时提供 HTTP + WS，确保同源；Phase 3 改用 WebRTC（已加密，无此问题） |
| 手机 touch 坐标系与 canvas 缩放的精度问题 | Phase 3 操作体验 | `getBoundingClientRect()` 做坐标归一化，服务端按实际分辨率反算 |

---

## 开发顺序建议

```
Week 1-2:  Phase 1 全部（前端 + Rust RDP 命令）
Week 3-4:  Phase 2 Rust 后端（scrap + WS 推流 + axum HTTP 静态服务）
Week 5:    Phase 2 PC 前端（canvas 渲染 + 主机控制 UI）
Week 5.5:  Phase 2 手机 Web 客户端（client.html，touch 事件，PIN 登录）
Week 6:    Phase 2 联调 + 性能调优（JPEG quality, resize，PC + 手机均测）
Week 7-9:  Phase 3 信令服务 + str0m P2P 集成
Week 9.5:  Phase 3 手机 WebRTC 适配（浏览器原生 API）
Week 10:   Phase 3 输入注入（PC 鼠标键盘 + 手机 touch）+ 端到端测试
```
