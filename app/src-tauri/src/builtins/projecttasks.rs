use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::window_pinning;

const MAX_MARKDOWN_FILES: usize = 512;
const MAX_MARKDOWN_BYTES: u64 = 1024 * 1024;
const MAX_PROJECT_PROFILES: usize = 24;
const PROJECTTASKS_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTasksData {
    #[serde(default = "default_projecttasks_schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub project_profiles: Vec<ProjectProfile>,
    /// Legacy scan summaries remain readable while the UI migrates to project profiles.
    #[serde(default)]
    pub projects: Vec<ScannedProject>,
    #[serde(default)]
    pub task_favorites: Vec<FavoriteTaskRef>,
    #[serde(default)]
    pub config_favorites: Vec<FavoriteConfigRef>,
    #[serde(default)]
    pub last_root: String,
}

impl Default for ProjectTasksData {
    fn default() -> Self {
        Self {
            schema_version: PROJECTTASKS_SCHEMA_VERSION,
            project_profiles: Vec::new(),
            projects: Vec::new(),
            task_favorites: Vec::new(),
            config_favorites: Vec::new(),
            last_root: String::new(),
        }
    }
}

fn default_projecttasks_schema_version() -> u32 {
    1
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectProfile {
    pub id: String,
    pub name: String,
    pub root: String,
    pub created_at: u64,
    pub last_visited_at: u64,
    #[serde(default = "default_profile_status")]
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository_hint: Option<String>,
}

fn default_profile_status() -> String {
    "ready".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScannedProject {
    #[serde(default)]
    pub project_id: String,
    pub root: String,
    pub name: String,
    pub task_count: u32,
    pub scanned_files: u32,
    pub last_scanned_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FavoriteTaskRef {
    pub root: String,
    pub file: String,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FavoriteConfigRef {
    pub root: String,
    pub path: String,
}

pub fn projecttasks_data_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("projecttasks_data.json")
}

pub fn read_projecttasks_data_from_path(path: &Path) -> Result<ProjectTasksData, String> {
    if !path.exists() {
        return Ok(ProjectTasksData::default());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let data = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    Ok(migrate_projecttasks_data(data))
}

pub fn write_projecttasks_data_to_path(path: &Path, data: &ProjectTasksData) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let normalized = migrate_projecttasks_data(data.clone());
    let json = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("projecttasks_data.json");
    let temporary = path.with_file_name(format!(".{file_name}.tmp-{}", unix_time_millis()));
    fs::write(&temporary, json).map_err(|e| e.to_string())?;
    if fs::rename(&temporary, path).is_ok() {
        return Ok(());
    }
    let backup = path.with_file_name(format!(".{file_name}.bak-{}", unix_time_millis()));
    if path.exists() {
        fs::rename(path, &backup).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            error.to_string()
        })?;
    }
    match fs::rename(&temporary, path) {
        Ok(()) => {
            let _ = fs::remove_file(&backup);
            Ok(())
        }
        Err(error) => {
            let _ = fs::rename(&backup, path);
            let _ = fs::remove_file(&temporary);
            Err(error.to_string())
        }
    }
}

#[tauri::command]
pub fn load_projecttasks_data(app: tauri::AppHandle) -> Result<ProjectTasksData, String> {
    read_projecttasks_data_from_path(&projecttasks_data_path(&app))
}

#[tauri::command]
pub fn save_projecttasks_data(app: tauri::AppHandle, data: ProjectTasksData) -> Result<(), String> {
    write_projecttasks_data_to_path(&projecttasks_data_path(&app), &data)
}

#[tauri::command]
pub fn list_project_profiles(app: tauri::AppHandle) -> Result<Vec<ProjectProfile>, String> {
    Ok(read_projecttasks_data_from_path(&projecttasks_data_path(&app))?.project_profiles)
}

#[tauri::command]
pub fn relocate_project_profile(
    app: tauri::AppHandle,
    project_id: String,
    root: String,
) -> Result<ProjectProfile, String> {
    let canonical = canonical_directory(&root)?;
    let canonical_root = canonical.to_string_lossy().into_owned();
    let mut data = read_projecttasks_data_from_path(&projecttasks_data_path(&app))?;
    let profile = data
        .project_profiles
        .iter_mut()
        .find(|profile| profile.id == project_id)
        .ok_or_else(|| "项目档案不存在".to_string())?;
    profile.root = canonical_root.clone();
    profile.name = project_name(&canonical);
    profile.last_visited_at = unix_time_millis();
    profile.status = "ready".to_string();
    profile.repository_hint = repository_hint(&canonical);
    for project in &mut data.projects {
        if project.project_id == project_id {
            project.root = canonical_root.clone();
            project.name = profile.name.clone();
        }
    }
    let result = profile.clone();
    write_projecttasks_data_to_path(&projecttasks_data_path(&app), &data)?;
    Ok(result)
}

#[tauri::command]
pub fn remove_project_profile(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let path = projecttasks_data_path(&app);
    let mut data = read_projecttasks_data_from_path(&path)?;
    let roots = data
        .project_profiles
        .iter()
        .filter(|profile| profile.id == project_id)
        .map(|profile| profile.root.clone())
        .collect::<Vec<_>>();
    data.project_profiles
        .retain(|profile| profile.id != project_id);
    data.projects
        .retain(|project| project.project_id != project_id);
    data.task_favorites
        .retain(|favorite| !roots.iter().any(|root| root == &favorite.root));
    data.config_favorites
        .retain(|favorite| !roots.iter().any(|root| root == &favorite.root));
    if roots.iter().any(|root| root == &data.last_root) {
        data.last_root = data
            .project_profiles
            .first()
            .map(|profile| profile.root.clone())
            .unwrap_or_default();
    }
    write_projecttasks_data_to_path(&path, &data)
}

fn unix_time_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn project_id_for_root(root: &str) -> String {
    let digest = Sha256::digest(root.as_bytes());
    format!("project-{}", &format!("{digest:x}")[..16])
}

fn project_name(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("项目")
        .to_string()
}

fn repository_hint(root: &Path) -> Option<String> {
    let config = fs::read_to_string(root.join(".git").join("config")).ok()?;
    let mut in_origin = false;
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') {
            in_origin = trimmed == "[remote \"origin\"]";
            continue;
        }
        if !in_origin {
            continue;
        }
        let Some(value) = trimmed
            .strip_prefix("url")
            .and_then(|value| value.split_once('='))
        else {
            continue;
        };
        let remote = value
            .1
            .trim()
            .trim_end_matches('/')
            .trim_end_matches(".git");
        let path = remote
            .rsplit_once(':')
            .map(|(_, path)| path)
            .or_else(|| remote.split_once("://").map(|(_, value)| value))
            .unwrap_or(remote);
        let components = path
            .split('/')
            .filter(|component| !component.is_empty())
            .collect::<Vec<_>>();
        if components.len() >= 2 {
            return Some(format!(
                "{}/{}",
                components[components.len() - 2],
                components[components.len() - 1]
            ));
        }
    }
    None
}

fn git_branch(root: &Path) -> Option<String> {
    let head = fs::read_to_string(root.join(".git").join("HEAD")).ok()?;
    let value = head.trim();
    value
        .strip_prefix("ref: refs/heads/")
        .map(str::trim)
        .filter(|branch| !branch.is_empty())
        .map(ToOwned::to_owned)
}

fn migrate_projecttasks_data(mut data: ProjectTasksData) -> ProjectTasksData {
    let now = unix_time_millis();
    for project in &mut data.projects {
        if project.project_id.trim().is_empty() {
            project.project_id = project_id_for_root(&project.root);
        }
        if let Some(profile) = data
            .project_profiles
            .iter_mut()
            .find(|profile| profile.id == project.project_id || profile.root == project.root)
        {
            project.project_id = profile.id.clone();
            continue;
        }
        data.project_profiles.push(ProjectProfile {
            id: project.project_id.clone(),
            name: project.name.clone(),
            root: project.root.clone(),
            created_at: project.last_scanned_at.max(1),
            last_visited_at: project.last_scanned_at,
            status: if Path::new(&project.root).is_dir() {
                "ready".to_string()
            } else {
                "missing".to_string()
            },
            repository_hint: None,
        });
    }
    for profile in &mut data.project_profiles {
        if profile.id.trim().is_empty() {
            profile.id = project_id_for_root(&profile.root);
        }
        if profile.created_at == 0 {
            profile.created_at = now;
        }
        profile.status = if Path::new(&profile.root).is_dir() {
            "ready".to_string()
        } else {
            "missing".to_string()
        };
    }
    let mut unique = HashMap::<String, ProjectProfile>::new();
    let mut order = Vec::new();
    for profile in data.project_profiles {
        if !unique.contains_key(&profile.id) {
            order.push(profile.id.clone());
            unique.insert(profile.id.clone(), profile);
        }
    }
    data.project_profiles = order
        .into_iter()
        .filter_map(|id| unique.remove(&id))
        .take(MAX_PROJECT_PROFILES)
        .collect();
    data.schema_version = PROJECTTASKS_SCHEMA_VERSION;
    data
}

fn ensure_project_profile(
    data: &mut ProjectTasksData,
    root: &Path,
    task_count: usize,
    scanned_files: usize,
) -> ProjectProfile {
    let root_value = root.to_string_lossy().into_owned();
    let now = unix_time_millis();
    let name = project_name(root);
    let hint = repository_hint(root);
    let profile = if let Some(profile) = data
        .project_profiles
        .iter_mut()
        .find(|profile| profile.root == root_value)
    {
        profile.name = name.clone();
        profile.last_visited_at = now;
        profile.status = "ready".to_string();
        profile.repository_hint = hint.clone();
        profile.clone()
    } else {
        let profile = ProjectProfile {
            id: project_id_for_root(&root_value),
            name: name.clone(),
            root: root_value.clone(),
            created_at: now,
            last_visited_at: now,
            status: "ready".to_string(),
            repository_hint: hint,
        };
        data.project_profiles.insert(0, profile.clone());
        data.project_profiles.truncate(MAX_PROJECT_PROFILES);
        profile
    };
    let summary = ScannedProject {
        project_id: profile.id.clone(),
        root: root_value.clone(),
        name,
        task_count: task_count as u32,
        scanned_files: scanned_files as u32,
        last_scanned_at: now,
    };
    if let Some(index) = data
        .projects
        .iter()
        .position(|project| project.project_id == profile.id || project.root == root_value)
    {
        data.projects[index] = summary;
    } else {
        data.projects.insert(0, summary);
        data.projects.truncate(MAX_PROJECT_PROFILES);
    }
    data.last_root = root_value;
    profile
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunmeTask {
    pub id: String,
    pub provider: String,
    pub provider_label: String,
    pub source_key: String,
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
    pub project_id: String,
    pub root: String,
    pub project_name: String,
    pub runme_available: bool,
    pub runme_version: Option<String>,
    pub scanned_files: usize,
    pub providers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository_hint: Option<String>,
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
pub async fn discover_project_tasks(
    app: tauri::AppHandle,
    root: String,
) -> Result<RunmeDiscovery, String> {
    let mut discovery =
        tauri::async_runtime::spawn_blocking(move || discover_project_tasks_blocking(&root))
            .await
            .map_err(|error| format!("任务扫描线程失败：{error}"))??;
    let path = projecttasks_data_path(&app);
    let mut data = read_projecttasks_data_from_path(&path)?;
    let profile = ensure_project_profile(
        &mut data,
        Path::new(&discovery.root),
        discovery.tasks.len(),
        discovery.scanned_files,
    );
    discovery.project_id = profile.id;
    write_projecttasks_data_to_path(&path, &data)?;
    Ok(discovery)
}

#[tauri::command]
pub async fn discover_runme_tasks(
    app: tauri::AppHandle,
    root: String,
) -> Result<RunmeDiscovery, String> {
    discover_project_tasks(app, root).await
}

pub fn discover_project_tasks_blocking(root: &str) -> Result<RunmeDiscovery, String> {
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
    let package_tasks = discover_package_scripts(&root_path, &mut warnings)?;
    let has_package_tasks = !package_tasks.is_empty();
    tasks.extend(package_tasks);
    if tasks.is_empty() {
        warnings.push(
            "没有发现显式命名的 Runme 任务或 package scripts；可使用页面中的 AI 重构提示词整理项目任务。"
                .to_string(),
        );
    }

    let project_name = project_name(&root_path);
    let mut providers = Vec::new();
    if tasks.iter().any(|task| task.provider == "runme") {
        providers.push("runme".to_string());
    }
    if has_package_tasks {
        providers.push("package".to_string());
    }
    let repository_hint = repository_hint(&root_path);

    Ok(RunmeDiscovery {
        project_id: String::new(),
        root: root_path.to_string_lossy().into_owned(),
        project_name,
        runme_available,
        runme_version,
        scanned_files: files.len() + usize::from(has_package_tasks),
        providers,
        git_branch: git_branch(&root_path),
        repository_hint,
        tasks,
        warnings,
    })
}

/// Validate a task reference and produce a shell command for the existing PTY terminal.
/// The command is returned to the frontend so the user keeps existing terminal behavior.
#[tauri::command]
pub fn runme_task_command(root: String, file: String, name: String) -> Result<String, String> {
    let root_path = canonical_directory(&root)?;
    runme_task_command_for_root(&root_path, &file, &name)
}

#[tauri::command]
pub fn project_task_command(
    app: tauri::AppHandle,
    project_id: String,
    provider: String,
    source_key: String,
    file: String,
    name: String,
) -> Result<String, String> {
    resolve_project_task_command(
        &projecttasks_data_path(&app),
        &project_id,
        &provider,
        &source_key,
        &file,
        &name,
    )
}

pub fn resolve_project_task_command(
    data_path: &Path,
    project_id: &str,
    provider: &str,
    source_key: &str,
    file: &str,
    name: &str,
) -> Result<String, String> {
    let data = read_projecttasks_data_from_path(data_path)?;
    let profile = data
        .project_profiles
        .iter()
        .find(|profile| profile.id == project_id)
        .ok_or_else(|| "项目档案不存在，请重新扫描项目".to_string())?;
    if profile.status != "ready" {
        return Err("项目需要重新定位后才能执行任务".to_string());
    }
    let root = canonical_directory(&profile.root)?;
    match provider {
        "runme" if source_key == name => runme_task_command_for_root(&root, file, name),
        "runme" => Err("Runme 任务引用无效".to_string()),
        "package" => package_task_command_for_root(&root, source_key, file, name),
        _ => Err(format!("不支持的项目任务来源：{provider}")),
    }
}

fn runme_task_command_for_root(root_path: &Path, file: &str, name: &str) -> Result<String, String> {
    if name.trim().is_empty() || name.chars().any(|character| character.is_control()) {
        return Err("Runme 任务名称无效".to_string());
    }
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

    let runme = resolve_runme_executable()
        .map(|path| shell_quote(&path.to_string_lossy()))
        .unwrap_or_else(|| "runme".to_string());
    Ok(format!(
        "cd {} && {} run {} --project {} --filename {}",
        shell_quote(&root_path.to_string_lossy()),
        runme,
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

fn discover_package_scripts(
    root: &Path,
    warnings: &mut Vec<String>,
) -> Result<Vec<RunmeTask>, String> {
    let path = root.join("package.json");
    if !path.is_file() {
        return Ok(Vec::new());
    }
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_MARKDOWN_BYTES {
        warnings.push("已跳过过大的 package.json".to_string());
        return Ok(Vec::new());
    }
    let source =
        fs::read_to_string(&path).map_err(|error| format!("无法读取 package.json：{error}"))?;
    let value: serde_json::Value = match serde_json::from_str(&source) {
        Ok(value) => value,
        Err(error) => {
            warnings.push(format!("package.json JSON 无效：{error}"));
            return Ok(Vec::new());
        }
    };
    let Some(scripts) = value.get("scripts").and_then(|value| value.as_object()) else {
        return Ok(Vec::new());
    };
    let manager = package_manager(root);
    let mut tasks = scripts
        .iter()
        .filter_map(|(name, value)| {
            let declared = value.as_str()?.trim();
            if name.trim().is_empty() || declared.is_empty() {
                return None;
            }
            let command = format!("{manager} run {}", shell_quote(name));
            Some(RunmeTask {
                id: format!("package:package.json:{name}"),
                provider: "package".to_string(),
                provider_label: "Package Scripts".to_string(),
                source_key: name.clone(),
                name: name.clone(),
                file: "package.json".to_string(),
                line: package_script_line(&source, name),
                language: "package-script".to_string(),
                command: command.clone(),
                category: classify_category(name, declared),
                risk: classify_risk(name, declared),
                runnable: true,
            })
        })
        .collect::<Vec<_>>();
    tasks.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(tasks)
}

fn package_manager(root: &Path) -> &'static str {
    if root.join("pnpm-lock.yaml").is_file() {
        "pnpm"
    } else if root.join("yarn.lock").is_file() {
        "yarn"
    } else if root.join("bun.lock").is_file() || root.join("bun.lockb").is_file() {
        "bun"
    } else {
        "npm"
    }
}

fn package_script_line(source: &str, name: &str) -> usize {
    let needle = format!("\"{name}\"");
    source
        .lines()
        .position(|line| line.contains(&needle))
        .map(|index| index + 1)
        .unwrap_or(1)
}

fn package_task_command_for_root(
    root: &Path,
    source_key: &str,
    file: &str,
    name: &str,
) -> Result<String, String> {
    if file != "package.json" {
        return Err("Package 任务必须来自项目根目录的 package.json".to_string());
    }
    if source_key.trim().is_empty()
        || source_key != name
        || source_key.chars().any(|character| character.is_control())
    {
        return Err("Package 任务引用无效".to_string());
    }
    let source = fs::read_to_string(root.join("package.json"))
        .map_err(|error| format!("无法读取 package.json：{error}"))?;
    let value: serde_json::Value = serde_json::from_str(&source)
        .map_err(|error| format!("package.json JSON 无效：{error}"))?;
    let exists = value
        .get("scripts")
        .and_then(|scripts| scripts.get(source_key))
        .and_then(|script| script.as_str())
        .is_some_and(|script| !script.trim().is_empty());
    if !exists {
        return Err("Package 任务已不存在，请重新扫描项目".to_string());
    }
    Ok(format!(
        "cd {} && {} run {}",
        shell_quote(&root.to_string_lossy()),
        package_manager(root),
        shell_quote(source_key),
    ))
}

fn runme_cli_info(root: &Path) -> (bool, Option<String>) {
    let Some(executable) = resolve_runme_executable() else {
        return (false, None);
    };
    let output = Command::new(executable)
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
    let executable = resolve_runme_executable().ok_or_else(|| "未检测到 Runme CLI".to_string())?;
    let output = Command::new(executable)
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

fn resolve_runme_executable() -> Option<PathBuf> {
    let executable_name = if cfg!(windows) { "runme.exe" } else { "runme" };
    if let Some(path) = env::var_os("PATH") {
        for directory in env::split_paths(&path) {
            let candidate = directory.join(executable_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("/bin/zsh")
            .args(["-lic", "command -v runme"])
            .output()
            .ok()?;
        if output.status.success() {
            let candidate = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
            if candidate.is_absolute() && candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
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
                provider: "runme".to_string(),
                provider_label: "Runme".to_string(),
                source_key: cli_task.name.clone(),
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
                provider: "runme".to_string(),
                provider_label: "Runme".to_string(),
                source_key: name.clone(),
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
        attribute_value, build_tasks_from_cli, classify_category, discover_package_scripts,
        package_task_command_for_root, parse_markdown_blocks, parse_markdown_tasks,
        parse_runme_list_json, read_projecttasks_data_from_path, runme_task_command,
        write_projecttasks_data_to_path, FavoriteTaskRef, ProjectTasksData, RunmeCliTask,
        ScannedProject,
    };
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn writes_and_reads_shared_projecttasks_data() {
        let directory = tempdir().expect("temporary data directory");
        let path = directory.path().join("projecttasks_data.json");
        let data = ProjectTasksData {
            projects: vec![ScannedProject {
                project_id: String::new(),
                root: "/projects/demo".into(),
                name: "demo".into(),
                task_count: 3,
                scanned_files: 4,
                last_scanned_at: 123,
            }],
            task_favorites: vec![FavoriteTaskRef {
                root: "/projects/demo".into(),
                file: "TASKS.md".into(),
                name: "test".into(),
            }],
            config_favorites: Vec::new(),
            last_root: "/projects/demo".into(),
            ..ProjectTasksData::default()
        };

        write_projecttasks_data_to_path(&path, &data).expect("write project task data");
        let loaded = read_projecttasks_data_from_path(&path).expect("read project task data");

        assert_eq!(loaded.projects.len(), 1);
        assert_eq!(loaded.projects[0].task_count, 3);
        assert_eq!(loaded.task_favorites[0].name, "test");
        assert_eq!(loaded.last_root, "/projects/demo");
        assert_eq!(loaded.schema_version, 2);
        assert_eq!(loaded.project_profiles.len(), 1);
        assert_eq!(loaded.projects[0].project_id, loaded.project_profiles[0].id);
    }

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

    #[test]
    fn discovers_package_scripts_without_running_them() {
        let directory = tempdir().expect("temporary project directory");
        fs::write(
            directory.path().join("package.json"),
            r#"{
  "scripts": {
    "test": "vitest run",
    "release": "git push origin main"
  }
}"#,
        )
        .expect("write package.json");
        fs::write(
            directory.path().join("pnpm-lock.yaml"),
            "lockfileVersion: '9.0'\n",
        )
        .expect("write lockfile");
        let root = directory
            .path()
            .canonicalize()
            .expect("canonical project path");
        let mut warnings = Vec::new();
        let tasks = discover_package_scripts(&root, &mut warnings).expect("discover scripts");
        assert!(warnings.is_empty());
        assert_eq!(tasks.len(), 2);
        let test = tasks
            .iter()
            .find(|task| task.name == "test")
            .expect("test task");
        assert_eq!(test.provider, "package");
        assert_eq!(test.command, "pnpm run 'test'");
        let release = tasks
            .iter()
            .find(|task| task.name == "release")
            .expect("release task");
        assert_eq!(release.risk, "review");

        let command = package_task_command_for_root(&root, "test", "package.json", "test")
            .expect("package task command");
        assert!(command.contains("pnpm run 'test'"));
        assert!(
            package_task_command_for_root(&root, "missing", "package.json", "missing").is_err()
        );
    }
}
