# Chrome 网页账号管理规划

## 目标

DevLauncher 支持为网页绑定安全保存账号密码，并且在使用外置 Google Chrome 打开登录页时自动填入。密码不得写入 YAML、浏览器 storage 或日志。

## 市场与开源参考

- Bitwarden：多端账号保险箱，Chrome 扩展负责页面识别和填充，桌面端/云端负责 vault。
- KeePassXC-Browser：Chrome/Firefox/Edge 扩展通过 Native Messaging 连接桌面 KeePassXC，桌面程序负责本地密码库。
- Browserpass：扩展连接本机 `pass` 密码库，浏览器端只做页面填充。
- Passbolt：团队密码管理器，浏览器扩展是 Chrome 登录填充入口。

结论：外置 Chrome 是硬约束时，必须采用 Chrome 扩展加 Native Messaging Host。Tauri 只能打开 Chrome，不能直接安全稳定地操作 Chrome 页面的登录表单。

## 架构

1. DevLauncher App
   - 管理网页绑定、账号元数据、Chrome 启动、凭据保存和删除。
   - 复用现有 `keyring` 依赖，把密码保存到 OS 凭据库。

2. Chrome Extension
   - Manifest V3。
   - `content_script` 检测登录表单并填入。
   - `service_worker` 通过 Native Messaging 请求凭据。
   - 默认使用 `activeTab` 和按站点授权，避免一开始申请所有网站权限。

3. Native Messaging Host
   - Rust stdio 程序。
   - 校验请求 origin，只返回匹配站点和用户名的凭据。
   - 读取 DevLauncher 非敏感配置索引，并从 OS keyring 读取密码。

## 安全规则

- 密码只存 OS keyring。
- YAML 只存 URL、origin、用户名、`hasPassword`、填充策略、可选选择器。
- 默认只允许 HTTPS；localhost/127.0.0.1 可用于开发例外。
- 扩展 storage 不保存密码。
- Native host 不接受任意 origin 请求，必须和绑定 origin 匹配。
- 默认只填入，不自动提交。
- 清除绑定时同步删除 keyring 凭据。

## 实施阶段

### 阶段 1：数据模型与凭据命令

- 扩展 URL action 字段：用户名、是否保存密码、是否启用 Chrome 自动填入、是否自动提交、可选 CSS selector。
- 新增 `save_web_password`、`delete_web_password`。
- 新增网页凭据 key 生成规则。
- 测试：TypeScript 类型检查、Rust `cargo check`。

### 阶段 2：绑定 UI 与 Chrome 打开

- 在 URL 绑定表单中增加网页账号区。
- 保存密码时调用 Tauri 命令；配置中只保存 `hasPassword`。
- URL action 执行时，如果启用网页账号，优先用 Chrome 打开。
- 测试：前端 build、Rust check、目标字段搜索确保密码不入配置模型。

### 阶段 3：Chrome 扩展与 Native Host 骨架

- 新增 `chrome-extension/webaccounts`。
- 新增 Rust native host bin，支持 `getCredentials` 请求。
- 提供 Native Messaging manifest 模板和 Windows 注册说明。
- 测试：扩展 JS 静态语法检查、native host 编译。

### 阶段 4：运行联调

- 安装 unpacked Chrome 扩展。
- 注册 Native Messaging Host。
- 绑定一个测试 HTTPS 登录页。
- 验证 Chrome 打开后登录页自动填入。

## 延后项

- Chrome Web Store 发布。
- 多 vault、团队共享、端到端同步。
- KeePass/Bitwarden 导入。
- 密码健康报告。
- Passkey 支持。
