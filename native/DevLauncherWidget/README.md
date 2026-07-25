# DevLauncher macOS Widget（最小原型）

这是一个独立的 WidgetKit Extension 原型，不会替换现有的 React + Tauri 应用。

当前版本会读取 DevLauncher“设置 → 小组件”中选择的虚拟键盘绑定，显示对应名称和图标。支持小、中、大三种尺寸，分别显示前 4、8、16 个入口；点击后使用 `devlauncher://run-binding` 深链执行对应绑定。

## 本地构建

```bash
xcodebuild \
  -project DevLauncherWidget/DevLauncherWidget.xcodeproj \
  -scheme DevLauncherWidget \
  -configuration Debug \
  -sdk macosx \
  CODE_SIGNING_ALLOWED=NO \
  build
```

当前实现已经接入 Tauri 的 macOS 打包流程。运行 `npm run tauri build -- --bundles app` 时，Tauri 会构建扩展和刷新助手，再将它们放入最终 `.app`。宿主应用注册了 `devlauncher://` 深链，并在保存设置时写入共享快照、通知 WidgetKit 刷新。

## 安装到本机进行显示

```bash
cd app
npm run tauri build -- --bundles app
npm run sign:mac:app
open src-tauri/target/release/bundle/macos/DevLauncher.app
```

然后在 macOS 桌面右键选择“编辑小组件”，搜索“DevLauncher 快捷入口”。本地 ad-hoc 签名用于开发验证；正式分发时请设置 `DEVLAUNCHER_SIGNING_IDENTITY` 并使用对应的 Apple provisioning profile。

宿主和 Widget Extension 使用 `group.com.yisheng.devlauncher` App Group 共享快捷操作快照。正式分发时，两者必须由同一 Apple Developer Team 签名，并在开发者后台启用相同的 App Group。
