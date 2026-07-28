use app_lib::builtins::projecttasks::{
    discover_project_tasks_blocking, read_projecttasks_data_from_path, resolve_project_task_command,
};
use app_lib::config::{read_config_from_path, write_config_to_path};
use app_lib::types::{Action, KeyboardConfig, WorkflowDefinition};
use app_lib::workflow::{read_workflow_run_history_from_path, validate_workflow_definition};
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplyInput {
    expected_revision: u64,
    workflow: WorkflowDefinition,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteInput {
    expected_revision: u64,
    workflow_id: String,
    #[serde(default)]
    remove_bindings: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BindInput {
    expected_revision: u64,
    workflow_id: String,
    page_name: Option<String>,
    page_index: Option<usize>,
    key: String,
    #[serde(default)]
    replace: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnbindInput {
    expected_revision: u64,
    page_name: Option<String>,
    page_index: Option<usize>,
    key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTaskPreviewInput {
    project_id: String,
    provider: String,
    source_key: String,
    file: String,
    task_name: String,
}

struct ConfigLock {
    path: PathBuf,
}

impl Drop for ConfigLock {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn default_config_path() -> PathBuf {
    if let Some(path) = std::env::var_os("DEVLAUNCHER_CONFIG_PATH") {
        return PathBuf::from(path);
    }

    #[cfg(target_os = "macos")]
    {
        return home_dir()
            .join("Library")
            .join("Application Support")
            .join("com.yisheng.app")
            .join("keyboard.yaml");
    }

    #[cfg(target_os = "windows")]
    {
        let base = std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join("AppData").join("Roaming"));
        return base.join("com.yisheng.app").join("keyboard.yaml");
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let base = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home_dir().join(".local").join("share"));
        base.join("com.yisheng.app").join("keyboard.yaml")
    }
}

fn home_dir() -> PathBuf {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn read_stdin<T: for<'de> Deserialize<'de>>() -> Result<T, String> {
    let mut value = String::new();
    io::stdin()
        .read_to_string(&mut value)
        .map_err(|error| error.to_string())?;
    serde_json::from_str(&value).map_err(|error| format!("invalid JSON input: {error}"))
}

fn lock_config(config_path: &Path) -> Result<ConfigLock, String> {
    let lock_path = config_path.with_extension("yaml.lock");
    if let Some(parent) = lock_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&lock_path)
        .map_err(|error| format!("configuration is busy: {error}"))?;
    Ok(ConfigLock { path: lock_path })
}

fn read_config(path: &PathBuf) -> Result<KeyboardConfig, String> {
    read_config_from_path(path)
}

fn require_revision(config: &KeyboardConfig, expected: u64) -> Result<(), Value> {
    if config.revision == expected {
        return Ok(());
    }
    Err(json!({
        "ok": false,
        "code": "REVISION_CONFLICT",
        "message": format!("expected revision {expected}, current revision is {}", config.revision),
        "revision": config.revision,
    }))
}

fn resolve_page_index(
    config: &KeyboardConfig,
    page_index: Option<usize>,
    page_name: Option<&str>,
) -> Result<usize, String> {
    if let Some(index) = page_index {
        if index < config.pages.len() {
            return Ok(index);
        }
        return Err(format!("page index {index} does not exist"));
    }
    if let Some(name) = page_name {
        return config
            .pages
            .iter()
            .position(|page| page.name == name)
            .ok_or_else(|| format!("page does not exist: {name}"));
    }
    Err("pageName or pageIndex is required".into())
}

fn workflow_summary(workflow: &WorkflowDefinition) -> Value {
    json!({
        "id": workflow.id,
        "name": workflow.name,
        "description": workflow.description,
        "enabled": workflow.enabled,
        "schedule": workflow.schedule,
        "stepCount": workflow.steps.len(),
        "updatedAt": workflow.updated_at,
    })
}

fn capabilities() -> Value {
    json!({
        "ok": true,
        "data": {
            "schemaVersion": 2,
            "actions": ["app", "folder", "file", "url", "ssh", "script", "project_task", "system", "builtin", "plugin"],
            "conditions": ["always", "previous_success", "previous_failed", "platform", "path_exists", "env_equals"],
            "completions": ["action_resolved", "process_started", "process_exit", "port_ready", "timer", "manual"],
            "schedules": ["interval", "daily"],
            "platforms": ["macos", "windows", "linux"],
            "limits": {
                "maxSteps": 64,
                "maxScriptBytes": 32768,
                "minScheduleIntervalMinutes": 1,
                "maxScheduleIntervalMinutes": 10080,
                "maxTimeoutMs": 86400000
            }
        }
    })
}

fn app_data_file(config_path: &Path, name: &str) -> PathBuf {
    config_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(name)
}

fn list_projects(config_path: &Path) -> Result<Value, String> {
    let data =
        read_projecttasks_data_from_path(&app_data_file(config_path, "projecttasks_data.json"))?;
    Ok(json!({
        "ok": true,
        "data": data.project_profiles.into_iter().map(|profile| json!({
            "id": profile.id,
            "name": profile.name,
            "status": profile.status,
            "repositoryHint": profile.repository_hint,
            "lastVisitedAt": profile.last_visited_at,
        })).collect::<Vec<_>>(),
    }))
}

fn list_project_tasks(config_path: &Path, project_id: &str) -> Result<Value, String> {
    let data =
        read_projecttasks_data_from_path(&app_data_file(config_path, "projecttasks_data.json"))?;
    let profile = data
        .project_profiles
        .iter()
        .find(|profile| profile.id == project_id)
        .ok_or_else(|| "project profile not found".to_string())?;
    if profile.status != "ready" {
        return Ok(json!({
            "ok": false,
            "code": "PROJECT_RELOCATION_REQUIRED",
            "message": "project profile must be relocated before scanning",
        }));
    }
    let discovery = discover_project_tasks_blocking(&profile.root)?;
    Ok(json!({
        "ok": true,
        "data": {
            "projectId": profile.id,
            "projectName": profile.name,
            "providers": discovery.providers,
            "gitBranch": discovery.git_branch,
            "repositoryHint": discovery.repository_hint,
            "tasks": discovery.tasks.into_iter().map(|task| json!({
                "id": task.id,
                "provider": task.provider,
                "providerLabel": task.provider_label,
                "sourceKey": task.source_key,
                "name": task.name,
                "file": task.file,
                "line": task.line,
                "language": task.language,
                "category": task.category,
                "risk": task.risk,
                "runnable": task.runnable,
            })).collect::<Vec<_>>(),
            "warnings": discovery.warnings,
        },
    }))
}

fn preview_project_task(config_path: &Path) -> Result<Value, String> {
    let input: ProjectTaskPreviewInput = read_stdin()?;
    let data_path = app_data_file(config_path, "projecttasks_data.json");
    resolve_project_task_command(
        &data_path,
        &input.project_id,
        &input.provider,
        &input.source_key,
        &input.file,
        &input.task_name,
    )?;
    Ok(json!({
        "ok": true,
        "data": {
            "projectId": input.project_id,
            "provider": input.provider,
            "sourceKey": input.source_key,
            "file": input.file,
            "taskName": input.task_name,
            "resolvable": true,
        },
    }))
}

fn list_run_history(config_path: &Path) -> Result<Value, String> {
    let history = read_workflow_run_history_from_path(&app_data_file(
        config_path,
        "workflow_run_history.json",
    ))?;
    Ok(json!({
        "ok": true,
        "data": history.records,
    }))
}

fn append_read_audit(
    config_path: &Path,
    tool: &str,
    project_id: Option<&str>,
    result: &Result<Value, String>,
) {
    let path = app_data_file(config_path, "automation_audit.jsonl");
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let resolved_project_id = project_id.or_else(|| {
        result
            .as_ref()
            .ok()
            .and_then(|value| value.pointer("/data/projectId"))
            .and_then(Value::as_str)
    });
    let (result_code, ok) = match result {
        Ok(value) => (
            value.get("code").and_then(Value::as_str).unwrap_or("OK"),
            value.get("ok").and_then(Value::as_bool).unwrap_or(true),
        ),
        Err(_) => ("VALIDATION_ERROR", false),
    };
    let record = json!({
        "timestamp": timestamp,
        "tool": tool,
        "projectId": resolved_project_id,
        "risk": "read_only",
        "resultCode": result_code,
        "ok": ok,
    });
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{record}");
    }
}

fn list_workflows(config_path: &PathBuf) -> Result<Value, String> {
    let config = read_config(config_path)?;
    Ok(json!({
        "ok": true,
        "revision": config.revision,
        "data": config.workflows.iter().map(workflow_summary).collect::<Vec<_>>(),
    }))
}

fn get_workflow(config_path: &PathBuf, identifier: &str) -> Result<Value, String> {
    let config = read_config(config_path)?;
    let workflow = config
        .workflows
        .iter()
        .find(|workflow| workflow.id == identifier || workflow.name == identifier);
    match workflow {
        Some(workflow) => Ok(json!({
            "ok": true,
            "revision": config.revision,
            "data": workflow,
        })),
        None => Ok(json!({
            "ok": false,
            "code": "NOT_FOUND",
            "message": format!("workflow does not exist: {identifier}"),
            "revision": config.revision,
        })),
    }
}

fn preview_workflow(config_path: &PathBuf) -> Result<Value, String> {
    let workflow: WorkflowDefinition = read_stdin()?;
    let config = read_config(config_path)?;
    let report = validate_workflow_definition(&workflow);
    let replacing = config.workflows.iter().any(|item| item.id == workflow.id);
    Ok(json!({
        "ok": report.valid,
        "code": if report.valid { Value::Null } else { json!("VALIDATION_FAILED") },
        "revision": config.revision,
        "data": {
            "workflow": workflow,
            "validation": report,
            "change": if replacing { "update" } else { "create" },
        },
    }))
}

fn apply_workflow(config_path: &PathBuf) -> Result<Value, String> {
    let input: ApplyInput = read_stdin()?;
    let _lock = lock_config(config_path)?;
    let mut config = read_config(config_path)?;
    if let Err(conflict) = require_revision(&config, input.expected_revision) {
        return Ok(conflict);
    }
    let report = validate_workflow_definition(&input.workflow);
    if !report.valid {
        return Ok(json!({
            "ok": false,
            "code": "VALIDATION_FAILED",
            "message": "workflow validation failed",
            "revision": config.revision,
            "data": report,
        }));
    }
    if config
        .workflows
        .iter()
        .any(|item| item.id != input.workflow.id && item.name == input.workflow.name)
    {
        return Ok(json!({
            "ok": false,
            "code": "NAME_CONFLICT",
            "message": format!("another workflow already uses the name: {}", input.workflow.name),
            "revision": config.revision,
        }));
    }

    let change = if let Some(index) = config
        .workflows
        .iter()
        .position(|workflow| workflow.id == input.workflow.id)
    {
        config.workflows[index] = input.workflow;
        "updated"
    } else {
        config.workflows.push(input.workflow);
        "created"
    };
    config.schema_version = 2;
    config.revision += 1;
    write_config_to_path(config_path, &config)?;
    Ok(json!({
        "ok": true,
        "revision": config.revision,
        "data": { "change": change },
        "warnings": report.warnings,
    }))
}

fn delete_workflow(config_path: &PathBuf) -> Result<Value, String> {
    let input: DeleteInput = read_stdin()?;
    let _lock = lock_config(config_path)?;
    let mut config = read_config(config_path)?;
    if let Err(conflict) = require_revision(&config, input.expected_revision) {
        return Ok(conflict);
    }
    if !config
        .workflows
        .iter()
        .any(|workflow| workflow.id == input.workflow_id)
    {
        return Ok(json!({
            "ok": false,
            "code": "NOT_FOUND",
            "message": "workflow does not exist",
            "revision": config.revision,
        }));
    }
    let bindings = config
        .pages
        .iter()
        .flat_map(|page| page.keys.values())
        .filter(|action| {
            matches!(
                action,
                Action::Workflow { workflow_id, .. } if workflow_id == &input.workflow_id
            )
        })
        .count();
    if bindings > 0 && !input.remove_bindings {
        return Ok(json!({
            "ok": false,
            "code": "WORKFLOW_IS_BOUND",
            "message": format!("workflow has {bindings} keyboard binding(s)"),
            "revision": config.revision,
        }));
    }
    config
        .workflows
        .retain(|workflow| workflow.id != input.workflow_id);
    if input.remove_bindings {
        for page in &mut config.pages {
            page.keys.retain(|_, action| {
                !matches!(
                    action,
                    Action::Workflow { workflow_id, .. } if workflow_id == &input.workflow_id
                )
            });
        }
    }
    config.revision += 1;
    write_config_to_path(config_path, &config)?;
    Ok(json!({
        "ok": true,
        "revision": config.revision,
        "data": { "removedBindings": if input.remove_bindings { bindings } else { 0 } },
    }))
}

fn bind_workflow(config_path: &PathBuf) -> Result<Value, String> {
    let input: BindInput = read_stdin()?;
    let _lock = lock_config(config_path)?;
    let mut config = read_config(config_path)?;
    if let Err(conflict) = require_revision(&config, input.expected_revision) {
        return Ok(conflict);
    }
    let workflow = match config
        .workflows
        .iter()
        .find(|workflow| workflow.id == input.workflow_id)
    {
        Some(workflow) => workflow,
        None => {
            return Ok(json!({
                "ok": false,
                "code": "NOT_FOUND",
                "message": "workflow does not exist",
                "revision": config.revision,
            }))
        }
    };
    let workflow_name = workflow.name.clone();
    let page_index = match resolve_page_index(&config, input.page_index, input.page_name.as_deref())
    {
        Ok(index) => index,
        Err(message) => {
            return Ok(json!({
                "ok": false,
                "code": "NOT_FOUND",
                "message": message,
                "revision": config.revision,
            }))
        }
    };
    if config.pages[page_index].keys.contains_key(&input.key) && !input.replace {
        return Ok(json!({
            "ok": false,
            "code": "KEY_IS_BOUND",
            "message": format!("{} · {} already has a binding", config.pages[page_index].name, input.key),
            "revision": config.revision,
        }));
    }
    config.pages[page_index].keys.insert(
        input.key.clone(),
        Action::Workflow {
            name: workflow_name,
            icon: None,
            workflow_id: input.workflow_id,
        },
    );
    config.revision += 1;
    write_config_to_path(config_path, &config)?;
    Ok(json!({
        "ok": true,
        "revision": config.revision,
        "data": {
            "page": config.pages[page_index].name,
            "key": input.key,
        },
    }))
}

fn unbind_key(config_path: &PathBuf) -> Result<Value, String> {
    let input: UnbindInput = read_stdin()?;
    let _lock = lock_config(config_path)?;
    let mut config = read_config(config_path)?;
    if let Err(conflict) = require_revision(&config, input.expected_revision) {
        return Ok(conflict);
    }
    let page_index = match resolve_page_index(&config, input.page_index, input.page_name.as_deref())
    {
        Ok(index) => index,
        Err(message) => {
            return Ok(json!({
                "ok": false,
                "code": "NOT_FOUND",
                "message": message,
                "revision": config.revision,
            }))
        }
    };
    let removed = config.pages[page_index].keys.remove(&input.key).is_some();
    if removed {
        config.revision += 1;
        write_config_to_path(config_path, &config)?;
    }
    Ok(json!({
        "ok": true,
        "revision": config.revision,
        "data": { "removed": removed },
    }))
}

fn run() -> Result<Value, String> {
    let mut args = std::env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "capabilities".into());
    let config_path = default_config_path();
    let mut audit: Option<(&str, Option<String>)> = None;
    let result = match command.as_str() {
        "capabilities" => Ok(capabilities()),
        "list" => list_workflows(&config_path),
        "get" => get_workflow(
            &config_path,
            &args
                .next()
                .ok_or_else(|| "workflow ID or exact name is required".to_string())?,
        ),
        "preview" => preview_workflow(&config_path),
        "apply" => apply_workflow(&config_path),
        "delete" => delete_workflow(&config_path),
        "bind" => bind_workflow(&config_path),
        "unbind" => unbind_key(&config_path),
        "projects" => {
            audit = Some(("devlauncher_list_projects", None));
            list_projects(&config_path)
        }
        "project-tasks" => {
            let project_id = args
                .next()
                .ok_or_else(|| "project ID is required".to_string())?;
            audit = Some(("devlauncher_list_project_tasks", Some(project_id.clone())));
            list_project_tasks(&config_path, &project_id)
        }
        "project-task-preview" => {
            audit = Some(("devlauncher_preview_project_task", None));
            preview_project_task(&config_path)
        }
        "run-history" => {
            audit = Some(("devlauncher_list_run_history", None));
            list_run_history(&config_path)
        }
        _ => Err(format!("unknown command: {command}")),
    };
    if let Some((tool, project_id)) = audit {
        append_read_audit(&config_path, tool, project_id.as_deref(), &result);
    }
    result
}

fn main() {
    let output = run().unwrap_or_else(|message| {
        json!({
            "ok": false,
            "code": "CONFIG_IO_ERROR",
            "message": message,
        })
    });
    println!(
        "{}",
        serde_json::to_string(&output).unwrap_or_else(|_| "{\"ok\":false}".into())
    );
}
