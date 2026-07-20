use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::window_pinning;

const MAX_MARKDOWN_FILES: usize = 512;
const MAX_MARKDOWN_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunmeTask {
    pub id: String,
    pub name: String,
    pub file: String,
    pub line: usize,
    pub language: String,
    pub command: String,
    pub category: String,
    pub risk: String,
    pub runnable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunmeDiscovery {
    pub root: String,
    pub project_name: String,
    pub runme_available: bool,
    pub runme_version: Option<String>,
    pub scanned_files: usize,
    pub tasks: Vec<RunmeTask>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct RunmeCliTask {
    name: String,
    file: String,
    #[serde(default)]
    first_command: String,
}

#[derive(Debug, Clone)]
struct ParsedMarkdownBlock {
    name: Option<String>,
    language: String,
    command: String,
    line: usize,
}

#[tauri::command]
pub async fn discover_runme_tasks(root: String) -> Result<RunmeDiscovery, String> {
    tauri::async_runtime::spawn_blocking(move || discover_runme_tasks_blocking(&root))
        .await
        .map_err(|error| format!("任务扫描线程失败：{error}"))?
}

fn discover_runme_tasks_blocking(root: &str) -> Result<RunmeDiscovery, String> {
    let root_path = canonical_directory(root)?;
    let mut files = Vec::new();
    collect_markdown_files(&root_path, &mut files, 0)?;
    files.sort();

    let mut tasks = Vec::new();
    let mut warnings = Vec::new();
    for file in &files {
        let metadata = fs::metadata(file).map_err(|error| error.to_string())?;
        if metadata.len() > MAX_MARKDOWN_BYTES {
            warnings.push(format!(
                "已跳过过大的 Markdown 文件：{}",
                display_relative_path(&root_path, file)
            ));
            continue;
        }
        let source = fs::read_to_string(file).map_err(|error| {
            format!(
                "无法读取 {}：{error}",
                display_relative_path(&root_path, file)
            )
        })?;
        let relative = display_relative_path(&root_path, file);
        tasks.extend(parse_markdown_tasks(&relative, &source));
    }

    let (runme_available, runme_version) = runme_cli_info(&root_path);
    if runme_available {
        match runme_list_tasks(&root_path) {
            Ok(cli_tasks) => {
                tasks = build_tasks_from_cli(&root_path, cli_tasks);
            }
            Err(error) => warnings.push(format!(
                "Runme 任务列表读取失败，已回退到 Markdown 扫描：{error}"
            )),
        }
    }
    if !runme_available {
        warnings
            .push("未检测到 Runme CLI；仍可查看任务，但执行前需要安装并加入 PATH。".to_string());
    }
    if tasks.is_empty() {
        warnings.push(
            "没有发现显式命名的 Runme 任务；可使用页面中的 AI 重构提示词整理 README 或 TASKS.md。"
                .to_string(),
        );
    }

    let project_name = root_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("项目")
        .to_string();

    Ok(RunmeDiscovery {
        root: root_path.to_string_lossy().into_owned(),
        project_name,
        runme_available,
        runme_version,
        scanned_files: files.len(),
        tasks,
        warnings,
    })
}

/// Validate a task reference and produce a shell command for the existing PTY terminal.
/// The command is returned to the frontend so the user keeps existing terminal behavior.
#[tauri::command]
pub fn runme_task_command(root: String, file: String, name: String) -> Result<String, String> {
    if name.trim().is_empty() || name.chars().any(|character| character.is_control()) {
        return Err("Runme 任务名称无效".to_string());
    }
    let root_path = canonical_directory(&root)?;
    let file_path = root_path.join(&file);
    let canonical_file = file_path
        .canonicalize()
        .map_err(|error| format!("任务文件不存在：{error}"))?;
    if !canonical_file.starts_with(&root_path) {
        return Err("任务文件必须位于项目目录内".to_string());
    }
    let extension = canonical_file
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension != "md" && extension != "markdown" {
        return Err("Runme 任务文件必须是 Markdown 文件".to_string());
    }

    let relative = display_relative_path(&root_path, &canonical_file);
    let source = fs::read_to_string(&canonical_file).map_err(|error| error.to_string())?;
    let parsed_task_exists = parse_markdown_tasks(&relative, &source)
        .iter()
        .any(|task| task.name == name);
    let cli_task_exists = runme_list_tasks(&root_path).ok().is_some_and(|cli_tasks| {
        cli_tasks.iter().any(|task| {
            task.name == name
                && normalize_cli_file(&root_path, &task.file).as_deref() == Some(relative.as_str())
        })
    });
    let task_exists = parsed_task_exists || cli_task_exists;
    if !task_exists {
        return Err("任务名称已不存在，建议重新扫描项目".to_string());
    }

    Ok(format!(
        "cd {} && runme run {} --project {} --filename {}",
        shell_quote(&root_path.to_string_lossy()),
        shell_quote(&name),
        shell_quote(&root_path.to_string_lossy()),
        shell_quote(&relative),
    ))
}

#[tauri::command]
pub fn toggle_projecttasks_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = if let Some(window) = app.get_webview_window("projecttasks") {
        window
    } else {
        WebviewWindowBuilder::new(
            &app,
            "projecttasks",
            WebviewUrl::App("index.html?view=projecttasks".into()),
        )
        .title("DevLauncher 项目任务")
        .inner_size(1180.0, 720.0)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(false)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|error| error.to_string())?
    };

    if window.is_visible().unwrap_or(false) {
        window.hide().map_err(|error| error.to_string())?;
    } else {
        window_pinning::apply_window_pin_state(&app, "projecttasks")?;
        window.show().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn canonical_directory(root: &str) -> Result<PathBuf, String> {
    if root.trim().is_empty() {
        return Err("项目目录不能为空".to_string());
    }
    let path = PathBuf::from(root)
        .canonicalize()
        .map_err(|error| format!("项目目录不存在：{error}"))?;
    if !path.is_dir() {
        return Err("项目路径不是目录".to_string());
    }
    Ok(path)
}

fn collect_markdown_files(
    directory: &Path,
    files: &mut Vec<PathBuf>,
    depth: usize,
) -> Result<(), String> {
    if depth > 6 || files.len() >= MAX_MARKDOWN_FILES {
        return Ok(());
    }
    let entries = fs::read_dir(directory).map_err(|error| format!("无法扫描项目目录：{error}"))?;
    for entry in entries {
        if files.len() >= MAX_MARKDOWN_FILES {
            break;
        }
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() {
            if matches!(
                name.as_str(),
                ".git" | "node_modules" | "target" | "dist" | "build" | ".venv" | "vendor"
            ) {
                continue;
            }
            collect_markdown_files(&path, files, depth + 1)?;
            continue;
        }
        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if extension == "md" || extension == "markdown" {
            files.push(path);
        }
    }
    Ok(())
}

fn runme_cli_info(root: &Path) -> (bool, Option<String>) {
    let output = Command::new("runme")
        .arg("--version")
        .current_dir(root)
        .output();
    let Ok(output) = output else {
        return (false, None);
    };
    if !output.status.success() {
        return (false, None);
    }
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (true, (!text.is_empty()).then_some(text))
}

fn runme_list_tasks(root: &Path) -> Result<Vec<RunmeCliTask>, String> {
    let output = Command::new("runme")
        .args(["list", "--json", "--project"])
        .arg(root)
        .current_dir(root)
        .output()
        .map_err(|error| format!("无法调用 Runme list：{error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("no named code blocks") {
            return Ok(Vec::new());
        }
        return Err(if stderr.is_empty() {
            format!("Runme list 退出码 {}", output.status)
        } else {
            stderr
        });
    }
    parse_runme_list_json(&output.stdout)
}

fn parse_runme_list_json(bytes: &[u8]) -> Result<Vec<RunmeCliTask>, String> {
    serde_json::from_slice(bytes).map_err(|error| format!("Runme list JSON 无效：{error}"))
}

fn build_tasks_from_cli(root: &Path, cli_tasks: Vec<RunmeCliTask>) -> Vec<RunmeTask> {
    let mut occurrences: HashMap<(String, String), usize> = HashMap::new();
    cli_tasks
        .into_iter()
        .filter_map(|cli_task| {
            if cli_task.name.trim().is_empty() {
                return None;
            }
            let relative = normalize_cli_file(root, &cli_task.file)?;
            let occurrence_key = (relative.clone(), cli_task.first_command.clone());
            let occurrence_index = occurrences.entry(occurrence_key).or_insert(0);
            let current_occurrence = *occurrence_index;
            *occurrence_index += 1;
            let path = root.join(&relative);
            let source = fs::read_to_string(&path).ok();
            let block = source.as_deref().and_then(|source| {
                parse_markdown_blocks(source)
                    .into_iter()
                    .filter(|block| first_command_matches(block, &cli_task.first_command))
                    .nth(current_occurrence)
            });
            let language = block
                .as_ref()
                .map(|block| block.language.clone())
                .unwrap_or_else(|| "shell".to_string());
            let command = block
                .as_ref()
                .map(|block| block.command.clone())
                .filter(|command| !command.is_empty())
                .unwrap_or_else(|| cli_task.first_command.clone());
            let line = block.as_ref().map(|block| block.line).unwrap_or(1);
            let runnable = is_supported_language(&language);

            Some(RunmeTask {
                id: format!("runme:{relative}:{line}:{}", cli_task.name),
                category: classify_category(&cli_task.name, &command),
                risk: classify_risk(&cli_task.name, &command),
                runnable,
                name: cli_task.name,
                file: relative,
                line,
                language,
                command,
            })
        })
        .collect()
}

fn normalize_cli_file(root: &Path, file: &str) -> Option<String> {
    let raw = PathBuf::from(file);
    let candidate = if raw.is_absolute() {
        raw
    } else {
        root.join(raw)
    };
    let canonical = candidate.canonicalize().ok()?;
    if !canonical.starts_with(root) {
        return None;
    }
    Some(display_relative_path(root, &canonical))
}

fn first_command_matches(block: &ParsedMarkdownBlock, first_command: &str) -> bool {
    let expected = first_command.trim();
    if expected.is_empty() {
        return false;
    }
    block
        .command
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        == Some(expected)
}

fn display_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string()
}

fn fence_start(line: &str) -> Option<(char, String)> {
    let trimmed = line.trim();
    for marker in ['`', '~'] {
        let prefix = marker.to_string().repeat(3);
        if trimmed.starts_with(&prefix) {
            return Some((marker, trimmed[3..].trim().to_string()));
        }
    }
    None
}

fn is_fence_end(line: &str, marker: char) -> bool {
    let trimmed = line.trim();
    trimmed
        .chars()
        .take_while(|character| *character == marker)
        .count()
        >= 3
        && trimmed
            .chars()
            .all(|character| character == marker || character.is_whitespace())
}

fn parse_markdown_tasks(file: &str, source: &str) -> Vec<RunmeTask> {
    parse_markdown_blocks(source)
        .into_iter()
        .filter_map(|block| {
            let name = block.name?;
            Some(RunmeTask {
                id: format!("runme:{file}:{}:{name}", block.line),
                category: classify_category(&name, &block.command),
                risk: classify_risk(&name, &block.command),
                runnable: is_supported_language(&block.language),
                name,
                file: file.to_string(),
                line: block.line,
                language: block.language,
                command: block.command,
            })
        })
        .collect()
}

fn parse_markdown_blocks(source: &str) -> Vec<ParsedMarkdownBlock> {
    let lines: Vec<&str> = source.lines().collect();
    let mut blocks = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let Some((marker, info)) = fence_start(lines[index]) else {
            index += 1;
            continue;
        };
        let start_line = index + 2;
        let language = info
            .split_whitespace()
            .next()
            .unwrap_or("shell")
            .trim_matches(|character| character == '{' || character == '}')
            .to_ascii_lowercase();
        let name = attribute_value(&info, "name");
        let mut body = Vec::new();
        index += 1;
        while index < lines.len() && !is_fence_end(lines[index], marker) {
            body.push(lines[index]);
            index += 1;
        }
        let command = body.join("\n").trim().to_string();
        if !command.is_empty() {
            blocks.push(ParsedMarkdownBlock {
                name: name.filter(|name| !name.trim().is_empty()),
                language: if language.is_empty() {
                    "shell".to_string()
                } else {
                    language
                },
                command,
                line: start_line,
            });
        }
        index += 1;
    }
    blocks
}

fn attribute_value(info: &str, key: &str) -> Option<String> {
    let bytes = info.as_bytes();
    let mut index = 0;
    while index + key.len() <= bytes.len() {
        let boundary_before = index == 0 || !bytes[index - 1].is_ascii_alphanumeric();
        if boundary_before && bytes[index..].starts_with(key.as_bytes()) {
            let after_key = index + key.len();
            let boundary_after =
                after_key == bytes.len() || !bytes[after_key].is_ascii_alphanumeric();
            if boundary_after {
                let mut cursor = after_key;
                while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                    cursor += 1;
                }
                if cursor < bytes.len() && (bytes[cursor] == b'=' || bytes[cursor] == b':') {
                    cursor += 1;
                    while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
                        cursor += 1;
                    }
                    if cursor >= bytes.len() {
                        return None;
                    }
                    if matches!(bytes[cursor], b'"' | b'\'') {
                        let quote = bytes[cursor];
                        cursor += 1;
                        let start = cursor;
                        while cursor < bytes.len() && bytes[cursor] != quote {
                            cursor += 1;
                        }
                        return Some(info[start..cursor].to_string());
                    }
                    let start = cursor;
                    while cursor < bytes.len()
                        && !bytes[cursor].is_ascii_whitespace()
                        && !matches!(bytes[cursor], b',' | b'}')
                    {
                        cursor += 1;
                    }
                    return Some(info[start..cursor].to_string());
                }
            }
        }
        index += 1;
    }
    None
}

fn is_supported_language(language: &str) -> bool {
    matches!(
        language,
        "sh" | "bash" | "zsh" | "shell" | "command" | "console"
    )
}

fn classify_category(name: &str, command: &str) -> String {
    let name = name.to_ascii_lowercase();
    category_from_text(&name)
        .or_else(|| category_from_text(&command.to_ascii_lowercase()))
        .unwrap_or("ops")
        .to_string()
}

fn category_from_text(text: &str) -> Option<&'static str> {
    let categories: [(&str, &[&str]); 7] = [
        (
            "test",
            &[
                "test", "lint", "check", "verify", "spec", "测试", "检查", "校验",
            ],
        ),
        (
            "setup",
            &[
                "install",
                "setup",
                "bootstrap",
                "deps",
                "dependency",
                "安装",
                "初始化环境",
                "依赖",
            ],
        ),
        (
            "deploy",
            &[
                "deploy", "rollout", "kubectl", "helm ", "ecs", "部署", "上线",
            ],
        ),
        (
            "release",
            &[
                "release",
                "publish",
                "git tag",
                "github release",
                "发布",
                "上传安装包",
            ],
        ),
        (
            "data",
            &[
                "migrate",
                "migration",
                "database",
                "db-",
                "seed",
                "backup",
                "restore",
                "迁移",
                "数据库",
                "备份",
                "恢复",
            ],
        ),
        (
            "build",
            &[
                "build", "compile", "package", "bundle", "dmg", "构建", "编译", "打包",
            ],
        ),
        (
            "develop",
            &[
                "dev-start",
                "dev-server",
                "run-local",
                "start-",
                "-start",
                "serve-",
                "-serve",
                "watch-",
                "-watch",
                "npm run dev",
                "pnpm dev",
                "yarn dev",
                "cargo run",
                "go run",
                "serve",
                "watch",
                "启动",
                "开发服务",
                "本地运行",
            ],
        ),
    ];
    categories.into_iter().find_map(|(category, terms)| {
        terms
            .iter()
            .any(|term| text.contains(term))
            .then_some(category)
    })
}

fn classify_risk(name: &str, command: &str) -> String {
    let text = format!("{} {}", name, command).to_ascii_lowercase();
    if [
        "rm -",
        "sudo ",
        "drop database",
        "kubectl delete",
        "docker system prune",
        "shutdown",
        "reboot",
    ]
    .iter()
    .any(|word| text.contains(word))
    {
        "dangerous".to_string()
    } else if [
        "deploy",
        "release",
        "publish",
        "migrate",
        "git push",
        "docker push",
    ]
    .iter()
    .any(|word| text.contains(word))
    {
        "review".to_string()
    } else {
        "safe".to_string()
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::{
        attribute_value, build_tasks_from_cli, classify_category, parse_markdown_blocks,
        parse_markdown_tasks, parse_runme_list_json, runme_task_command, RunmeCliTask,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn parses_named_runme_blocks_and_metadata() {
        let source = "# Tasks\n\n```bash { name=\"test app\" }\nnpm test\n```\n\n```sh {name=deploy}\ngit push origin main\n```\n\n```json {name=not-shell}\n{\"ok\":true}\n```\n";
        let tasks = parse_markdown_tasks("README.md", source);
        assert_eq!(tasks.len(), 3);
        assert_eq!(tasks[0].name, "test app");
        assert_eq!(tasks[0].category, "test");
        assert_eq!(tasks[1].risk, "review");
        assert!(!tasks[2].runnable);
    }

    #[test]
    fn supports_quoted_and_unquoted_attributes() {
        assert_eq!(
            attribute_value("sh { name='hello world' }", "name"),
            Some("hello world".to_string())
        );
        assert_eq!(
            attribute_value("sh {name=build}", "name"),
            Some("build".to_string())
        );
        assert_eq!(
            attribute_value("sh { name: \"check\" }", "name"),
            Some("check".to_string())
        );
        assert_eq!(
            attribute_value("sh {name=\"测试任务\"}", "name"),
            Some("测试任务".to_string())
        );
    }

    #[test]
    fn classifies_common_task_types_from_names_and_commands() {
        assert_eq!(classify_category("deps-install", "npm ci"), "setup");
        assert_eq!(classify_category("dev-start", "./run-local.sh"), "develop");
        assert_eq!(
            classify_category("backend-start", "go run ./cmd/api"),
            "develop"
        );
        assert_eq!(classify_category("test-backend", "go test ./..."), "test");
        assert_eq!(
            classify_category("package-app", "cargo tauri build"),
            "build"
        );
        assert_eq!(
            classify_category("release-github", "gh release create"),
            "release"
        );
        assert_eq!(
            classify_category("deploy-ecs", "podman compose up"),
            "deploy"
        );
        assert_eq!(classify_category("database-backup", "pg_dump app"), "data");
        assert_eq!(classify_category("show-status", "git status"), "ops");
        assert_eq!(
            classify_category("构建桌面端", "cargo tauri build"),
            "build"
        );
    }

    #[test]
    fn ignores_unnamed_blocks_during_local_discovery() {
        let blocks = parse_markdown_blocks("# Tasks\n\n```bash\ncd app\nnpm test\n```\n");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].name, None);
        assert_eq!(blocks[0].line, 4);

        let tasks =
            parse_markdown_tasks("README.md", "# Tasks\n\n```bash\ncd app\nnpm test\n```\n");
        assert!(tasks.is_empty());

        let json = br#"[{"name":"test-app","file":"README.md","first_command":"npm test","description":"","named":true,"run_all":true}]"#;
        let tasks = parse_runme_list_json(json).expect("valid Runme list JSON");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].name, "test-app");
        assert_eq!(tasks[0].first_command, "npm test");
    }

    #[test]
    fn enriches_named_cli_tasks_with_markdown_metadata() {
        let directory = tempdir().expect("temporary project directory");
        fs::write(
            directory.path().join("README.md"),
            "# Tasks\n\n```bash { name=test-app }\ncd app\nnpm test\n```\n\n```bash { name=build-app }\ncd app\nnpm run build\n```\n",
        )
        .expect("write markdown");
        let root = directory
            .path()
            .canonicalize()
            .expect("canonical project path");
        let tasks = build_tasks_from_cli(
            &root,
            vec![
                RunmeCliTask {
                    name: "test-app".to_string(),
                    file: "README.md".to_string(),
                    first_command: "cd app".to_string(),
                },
                RunmeCliTask {
                    name: "build-app".to_string(),
                    file: "README.md".to_string(),
                    first_command: "cd app".to_string(),
                },
            ],
        );
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].name, "test-app");
        assert_eq!(tasks[0].line, 4);
        assert_eq!(tasks[0].command, "cd app\nnpm test");
        assert!(tasks[0].runnable);
        assert_eq!(tasks[1].name, "build-app");
        assert_eq!(tasks[1].line, 9);
        assert_eq!(tasks[1].command, "cd app\nnpm run build");
    }

    #[test]
    fn validates_task_file_and_quotes_command_arguments() {
        let directory = tempdir().expect("temporary project directory");
        let markdown = "```bash {name=\"task ' one\"}\nprintf 'ok\\n'\n```\n";
        fs::write(directory.path().join("README.md"), markdown).expect("write markdown");

        let command = runme_task_command(
            directory.path().to_string_lossy().into_owned(),
            "README.md".to_string(),
            "task ' one".to_string(),
        )
        .expect("valid task command");
        assert!(command.contains("'task '\\'' one'"));
        assert!(runme_task_command(
            directory.path().to_string_lossy().into_owned(),
            "../README.md".to_string(),
            "task ' one".to_string(),
        )
        .is_err());
    }
}
