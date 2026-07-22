# 项目配置发现与编辑（第一阶段）

状态：已实现  
日期：2026-07-21

## 目标

在现有“项目任务”窗口增加“配置”视图，发现项目内常见配置文件，按环境分组预览，并在明确复核差异后安全编辑保存。

## 第一阶段范围

- 格式：`.env*`、YAML、JSON、JSONC、TOML、INI、Properties。
- 发现：识别常用配置名称、配置目录（包括运维常用的 `etc` 目录）和带环境名称的文件；忽略 `.git`、`node_modules`、`target`、`dist`、`build`、虚拟环境和缓存目录。
- 环境：文件名优先，上一级文件夹其次；无法识别时归入“公共”。
- 环境别名：本地、开发、测试、QA、预发布、线上，同时允许 `env/config/environments` 下的自定义环境目录。
- 查看：按环境筛选文件，显示文件格式、大小、环境来源和敏感字段提示。
- 默认项目：首次进入配置视图时自动扫描当前选中的项目；没有当前选择时扫描历史列表中的第一个项目。
- 收藏：任务和配置都可在列表或详情页收藏；配置收藏按“项目路径 + 配置文件路径”区分，持久保存并在当前环境列表置顶。
- 编辑：原文编辑，不重排 YAML/TOML，不丢失注释。
- 保存：语法校验、保存前后对照、线上环境二次确认、内容哈希冲突检查和同目录原子替换。

## 环境推断规则

1. 文件名优先，例如 `.env.test`、`application-prod.yaml`、`appsettings.Development.json`。
2. 文件名没有环境时，检查上一级文件夹，例如 `staging/config.yaml`。
3. 对 `environments/blue/settings.json`，将 `blue` 识别为自定义环境。
4. `.env.production.local` 归到线上环境；`local` 表示本地覆盖，不覆盖明确的 production 标记。
5. 无环境信息的 `config.yaml`、`package.json` 等归到公共配置。

## 安全边界

- 配置必须位于已选择项目目录内，拒绝绝对路径、目录穿越和指向项目外部的符号链接。
- 单文件最大 1 MB，扫描最多 512 个文件、目录深度最多 6 层。
- 密码、Token、Secret、API Key、Private Key、Access Key、连接串和数据库 URL 默认脱敏。
- 敏感内容只在用户点击“编辑原文”或“显示敏感值”后显示，不写入 localStorage、DevLauncher 配置或日志。
- 保存时重新读取文件并比较 SHA-256；文件被外部修改时拒绝覆盖。
- 保存先写入同目录临时文件并同步，再原子替换目标文件，同时保留原文件权限。
- 第一阶段不执行 Compose、Helm、Kustomize、Terraform 或 Pulumi 命令，也不声称生成“最终生效配置”。

## 代码位置

- Rust 扫描、读取、校验、保存：`app/src-tauri/src/builtins/projectconfigs.rs`
- React 配置视图：`app/src/builtins/projecttasks/ProjectConfigsPanel.tsx`
- 项目工具入口：`app/src/builtins/projecttasks/App.tsx`

## 后续阶段

- Compose 多文件合并预览。
- Spring Boot、ASP.NET 配置优先级预览。
- Helm values、Kustomize overlays、Terraform tfvars、Pulumi stacks 和 Ansible inventories 专用适配器。
- 环境矩阵、字段级差异和 Schema 自动补全。
