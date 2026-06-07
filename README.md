# DevLauncher

> 开发者效率启动器 — 把常用操作绑定到虚拟键盘，一键直达。

![version](https://img.shields.io/badge/version-0.2.0-blue)
![platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![tauri](https://img.shields.io/badge/Tauri-2.x-orange)

## 功能特性

| 功能 | 说明 |
|------|------|
| **虚拟键盘** | 4 行按键布局，每键独立绑定动作 |
| **多页面** | 支持多个键盘页（开发/运维等），Tab 键切换 |
| **页面管理** | 双击改名、右键删除、+ 新增页面 |
| **全局快捷键** | `Alt + 键` 全局触发，窗口隐藏时同样有效 |
| **系统托盘** | 关闭按钮隐藏到托盘，左键切换显示/隐藏，右键退出 |
| **内置剪切板** | 自动记录最近 30 条剪切板历史，搜索过滤，一键复制 |
| **主题系统** | 内置 5 套预设，支持自定义背景色/透明度/模糊强度/边框色 |
| **多动作类型** | App / 文件夹 / 文件 / URL / SSH / 脚本 / 系统命令 / 内置功能 |

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt + Space` | 显示 / 隐藏主窗口 |
| `Alt + [Q/W/E/...]` | 执行当前页面对应键的绑定动作 |
| `Ctrl + Shift + V` | 打开剪切板历史面板 |
| `Tab` / `Shift+Tab` | 切换键盘页面（窗口有焦点时） |

## 技术栈

- **Tauri 2** — 桌面框架（Rust 后端）
- **React 19 + TypeScript** — 前端
- **Zustand** — 状态管理
- **Vite + Tailwind CSS v4** — 构建与样式
- **serde_yaml** — YAML 配置持久化
- **arboard** — 剪切板访问

## 项目结构

```
dev-launcher/
├── app/
│   ├── src/
│   │   ├── App.tsx                 # 主组件（全局快捷键、Tab 切换）
│   │   ├── types/actions.ts        # Action 类型系统（唯一真相来源）
│   │   ├── store/useKeyboardStore.ts  # Zustand store
│   │   ├── api/config.ts           # 配置 CRUD
│   │   └── components/
│   │       ├── KeyCell.tsx         # 单键渲染
│   │       ├── KeyboardPanel.tsx   # 键盘布局
│   │       ├── BindingModal.tsx    # 绑定弹窗
│   │       ├── SettingsPanel.tsx   # 主题设置
│   │       ├── ClipboardPanel.tsx  # 剪切板历史
│   │       └── ActionIcon.tsx      # 类型图标
│   └── src-tauri/
│       └── src/lib.rs              # Rust 命令、托盘、剪切板轮询
└── README.md
```

## 配置文件

配置自动保存于：  
`%APPDATA%\com.yisheng.app\keyboard.yaml`

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

## 开发

**环境要求：** Rust 1.70+、Node.js 18+、Windows（WebView2）

```powershell
cd app
npm install
npm run tauri dev      # 启动开发服务器（首次编译 ~2min）
npm run tauri build
app\src-tauri\target\release\bundle\
├── nsis\DevLauncher_0.2.0_x64-setup.exe   ← 安装包（推荐发给别人）
└── msi\DevLauncher_0.2.0_x64_en-US.msi    ← MSI 安装包
```

**TypeScript 检查：**
```powershell
npx tsc --noEmit
```

## 版本历史

### v0.2.0
- 多页面 Tab 管理（双击改名 / 右键删除 / + 新增）
- 内置功能：剪切板历史（全局 `Ctrl+Shift+V` 唤起）
- 主题系统（5 预设 + 自定义）
- 全局快捷键（`Alt+Space` 切换窗口 + `Alt+键` 触发绑定）
- 系统托盘（隐藏/显示/退出）
- 文件/文件夹路径浏览器选择

### v0.1.0
- 基础虚拟键盘布局
- App / 文件夹 / URL / SSH / 脚本 / 系统命令绑定
- YAML 配置持久化
- 玻璃态透明 UI

## License

MIT
