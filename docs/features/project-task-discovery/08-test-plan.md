# 测试计划

## 自动化覆盖

| 层级 | 用例 | 命令 | 结果 |
| --- | --- | --- | --- |
| Rust 单元 | 解析命名 bash/sh/json 代码块、分类、风险、可执行性 | cargo test projecttasks | 通过 |
| Rust 单元 | 解析带引号、不带引号、冒号属性 | cargo test projecttasks | 通过 |
| Rust 单元 | 忽略未命名代码块，并用显式名称关联 Markdown 元数据 | cargo test projecttasks | 通过 |
| Rust 单元 | 根据英文、中文任务名和命令识别八类任务 | cargo test projecttasks | 通过 |
| 前端单元 | AI 重构提示词包含项目上下文、命名规范和安全边界 | npm test -- --run src/builtins/projecttasks/prompt.test.ts | 通过 |
| 前端单元 | 迁移旧路径、新项目置顶、已有项目原位更新、数量限制和移除历史 | npm test -- --run src/builtins/projecttasks/history.test.ts | 通过 |
| 前端单元 | builtin 图标联合类型和渲染 | npm test -- --run src/icons/icons.test.tsx | 通过 |
| 前端构建 | TypeScript 检查、Vite 生产构建 | npm run build | 通过 |

## 手工验收

- [ ] 用含有 README.md 命名代码块的项目扫描，确认文件和行号正确。
- [ ] 用只有未命名代码块的项目扫描，确认任务列表为空并自动展开 AI 重构提示词。
- [ ] 用结果不准确的项目扫描，确认可以手动查看和复制 AI 重构提示词。
- [ ] 扫描包含多类任务的项目，确认类型数量、全部分组和单类筛选正确。
- [ ] 连续扫描多个项目，确认最左侧历史顺序、点击切换、刷新重扫和移除行为正确。
- [x] 在 1180×720 窗口验证三栏无横向溢出，删除按钮为 28×28 且图标居中。
- [ ] 快速点击两个项目，确认界面保持响应，最后选择不会被较早扫描结果覆盖。
- [ ] 在未安装 Runme 的环境扫描，确认仍能浏览但不能执行。
- [ ] 删除一个任务代码块后直接执行旧列表，确认后端要求重新扫描。
- [ ] 选择项目外文件路径，确认命令生成被拒绝。
- [ ] 执行 safe 任务，确认终端窗口显示输出。
- [ ] 执行 review/dangerous 任务，确认出现确认弹窗。
- [ ] 保存任务后，在工作流面板确认出现单步工作流并可绑定键位。
- [ ] 在项目任务窗口保存后不重启主窗口，直接绑定键位并确认工作流仍存在。
- [ ] 关闭并重开项目任务窗口，确认最近项目目录恢复并重新扫描。

## 回归风险

- 新 builtin 会进入内置功能绑定列表和搜索索引，需要确认现有键位绑定弹窗仍可打开。
- 新 Tauri window 必须出现在 default capability，否则窗口可能能创建但不能调用窗口 API。
- 终端命令通过已有 terminal_run 路由，需确认不会覆盖用户正在等待的 pending command。
