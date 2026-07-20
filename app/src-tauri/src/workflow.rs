use crate::actions;
use crate::builtins::terminal::TerminalState;
use crate::config;
use crate::platform::{current_platform, Platform};
use crate::types::{
    generate_id, Action, CompletionRule, StepCondition, WorkflowDefinition, WorkflowStep,
};
use chrono::{Days, Local, LocalResult, TimeZone};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::mpsc::Receiver;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::net::TcpStream;

const MAX_STEPS: usize = 64;
const MAX_SCRIPT_BYTES: usize = 32 * 1024;
const MAX_TIMEOUT_MS: u64 = 24 * 60 * 60 * 1000;
const DEFAULT_SCRIPT_TIMEOUT_MS: u64 = 120_000;
const MIN_SCHEDULE_INTERVAL_MINUTES: u64 = 1;
const MAX_SCHEDULE_INTERVAL_MINUTES: u64 = 7 * 24 * 60;
const CANCELLED: &str = "__workflow_cancelled__";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowRunTrigger {
    Manual,
    Step,
    Schedule,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowRunStatus {
    Pending,
    Running,
    Waiting,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowStepRunStatus {
    Pending,
    Running,
    Waiting,
    Succeeded,
    Failed,
    Skipped,
    Cancelled,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStepRun {
    pub step_id: String,
    pub name: String,
    pub status: WorkflowStepRunStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_session_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_id: String,
    pub workflow_name: String,
    pub started_at: u64,
    pub trigger: WorkflowRunTrigger,
    pub status: WorkflowRunStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_step_id: Option<String>,
    pub steps: Vec<WorkflowStepRun>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowValidationReport {
    pub valid: bool,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Default)]
struct WorkflowEngineInner {
    runs: Mutex<HashMap<String, WorkflowRun>>,
    cancelled: Mutex<HashSet<String>>,
    manual_confirmations: Mutex<HashSet<(String, String)>>,
    schedules: Mutex<HashMap<String, WorkflowScheduleRuntime>>,
}

#[derive(Debug, Clone)]
struct WorkflowScheduleRuntime {
    signature: String,
    next_run_at: u64,
}

#[derive(Clone, Default)]
pub struct WorkflowEngineState {
    inner: Arc<WorkflowEngineInner>,
}

fn validate_timeout(value: u64, label: &str, errors: &mut Vec<String>) {
    if value == 0 || value > MAX_TIMEOUT_MS {
        errors.push(format!("{label} must be between 1 and {MAX_TIMEOUT_MS} ms"));
    }
}

fn validate_completion(step: &WorkflowStep, errors: &mut Vec<String>, warnings: &mut Vec<String>) {
    match &step.completion {
        CompletionRule::ActionResolved => {}
        CompletionRule::ProcessStarted {
            stabilization_ms,
            timeout_ms,
        } => {
            validate_timeout(*timeout_ms, "process_started timeout", errors);
            if *stabilization_ms > *timeout_ms {
                errors.push("process_started stabilization cannot exceed timeout".into());
            }
        }
        CompletionRule::ProcessExit {
            success_codes,
            timeout_ms,
        } => {
            validate_timeout(*timeout_ms, "process_exit timeout", errors);
            if success_codes.is_empty() {
                errors.push("process_exit requires at least one success code".into());
            }
            if !matches!(step.action, Action::Script { .. }) {
                errors.push("process_exit is only supported for script actions".into());
            }
        }
        CompletionRule::PortReady {
            host,
            interval_ms,
            timeout_ms,
            ..
        } => {
            if host.trim().is_empty() {
                errors.push("port_ready host is required".into());
            }
            validate_timeout(*timeout_ms, "port_ready timeout", errors);
            if *interval_ms < 100 || *interval_ms > *timeout_ms {
                errors.push(
                    "port_ready interval must be at least 100 ms and not exceed timeout".into(),
                );
            }
            if !matches!(host.as_str(), "127.0.0.1" | "localhost" | "::1") {
                warnings.push("port_ready reaches a non-loopback host".into());
            }
        }
        CompletionRule::Timer { duration_ms } => {
            validate_timeout(*duration_ms, "timer duration", errors);
        }
        CompletionRule::Manual { timeout_ms } => {
            if let Some(timeout_ms) = timeout_ms {
                validate_timeout(*timeout_ms, "manual timeout", errors);
            }
        }
        CompletionRule::WindowReady { .. } => {
            errors.push("window_ready adapter is not available in this release".into());
        }
        CompletionRule::UrlReady { .. } => {
            errors.push("url_ready adapter is not available in this release".into());
        }
        CompletionRule::ConnectionReady { .. } => {
            errors.push("connection_ready adapter is not available in this release".into());
        }
    }
}

fn validate_action(action: &Action, errors: &mut Vec<String>) {
    match action {
        Action::Script { content, file, .. } => {
            let size = content.as_ref().map(|value| value.len()).unwrap_or(0);
            if size > MAX_SCRIPT_BYTES {
                errors.push(format!("script exceeds {MAX_SCRIPT_BYTES} bytes"));
            }
            if content.as_deref().unwrap_or("").trim().is_empty()
                && file.as_deref().unwrap_or("").trim().is_empty()
            {
                errors.push("script content or file is required".into());
            }
        }
        Action::Workflow { .. } => {
            errors.push("nested workflow actions are not supported".into());
        }
        _ => {}
    }
}

pub fn validate_workflow_definition(workflow: &WorkflowDefinition) -> WorkflowValidationReport {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let name = workflow.name.trim();
    if name.is_empty() || name.chars().count() > 80 {
        errors.push("workflow name must contain 1 to 80 characters".into());
    }
    if workflow.steps.len() > MAX_STEPS {
        errors.push(format!("workflow cannot exceed {MAX_STEPS} steps"));
    }
    if let Some(schedule) = workflow
        .schedule
        .as_ref()
        .filter(|schedule| schedule.enabled)
    {
        match schedule.mode.as_str() {
            "interval" => {
                if !(MIN_SCHEDULE_INTERVAL_MINUTES..=MAX_SCHEDULE_INTERVAL_MINUTES)
                    .contains(&schedule.interval_minutes)
                {
                    errors.push(format!(
                        "schedule interval must be between {MIN_SCHEDULE_INTERVAL_MINUTES} and {MAX_SCHEDULE_INTERVAL_MINUTES} minutes"
                    ));
                }
            }
            "daily" => {
                if parse_daily_time(&schedule.daily_time).is_none() {
                    errors.push("daily schedule time must use HH:MM (00:00 to 23:59)".into());
                }
            }
            _ => errors.push("schedule mode must be interval or daily".into()),
        }
    }

    let mut ids = HashSet::new();
    for step in &workflow.steps {
        if step.id.trim().is_empty() || !ids.insert(step.id.clone()) {
            errors.push(format!(
                "step IDs must be non-empty and unique: {}",
                step.id
            ));
        }
        if step.name.trim().is_empty() || step.name.chars().count() > 80 {
            errors.push(format!(
                "step name must contain 1 to 80 characters: {}",
                step.id
            ));
        }
        if step.delay_ms > MAX_TIMEOUT_MS {
            errors.push(format!("step delay exceeds maximum: {}", step.id));
        }
        validate_action(&step.action, &mut errors);
        validate_completion(step, &mut errors, &mut warnings);
    }

    WorkflowValidationReport {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

#[tauri::command]
pub fn validate_workflow(workflow: WorkflowDefinition) -> WorkflowValidationReport {
    validate_workflow_definition(&workflow)
}

fn workflow_workspace_size(logical_width: f64, logical_height: f64) -> (f64, f64) {
    (
        1180.0_f64.min((logical_width - 32.0).max(920.0)),
        680.0_f64.min((logical_height - 110.0).max(540.0)),
    )
}

fn binding_workspace_size(logical_width: f64, logical_height: f64) -> (f64, f64) {
    (
        980.0_f64.min((logical_width - 32.0).max(920.0)),
        680.0_f64.min((logical_height - 110.0).max(540.0)),
    )
}

fn set_workspace_window_size(
    app: AppHandle,
    enabled: bool,
    preferred_width: f64,
    preferred_height: f64,
    size_for_monitor: fn(f64, f64) -> (f64, f64),
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let mut workspace_position = None;
    let size = if enabled {
        let (mut width, mut height) = (preferred_width, preferred_height);
        if let Some(monitor) = window
            .current_monitor()
            .map_err(|error| error.to_string())?
        {
            let scale = monitor.scale_factor();
            let monitor_size = monitor.size();
            let logical_width = monitor_size.width as f64 / scale;
            let logical_height = monitor_size.height as f64 / scale;
            (width, height) = size_for_monitor(logical_width, logical_height);
            let monitor_position = monitor.position();
            let origin_x = monitor_position.x as f64 / scale;
            let origin_y = monitor_position.y as f64 / scale;
            workspace_position = Some(tauri::LogicalPosition::new(
                origin_x + (logical_width - width) / 2.0,
                origin_y + 32.0,
            ));
        }
        tauri::LogicalSize::new(width, height)
    } else {
        tauri::LogicalSize::new(920.0, 540.0)
    };
    window.set_size(size).map_err(|error| error.to_string())?;
    if let Some(position) = workspace_position {
        window
            .set_position(position)
            .map_err(|error| error.to_string())
    } else {
        window.center().map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn set_workflow_workspace_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    set_workspace_window_size(app, enabled, 1180.0, 680.0, workflow_workspace_size)
}

#[tauri::command]
pub fn set_binding_workspace_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    set_workspace_window_size(app, enabled, 980.0, 680.0, binding_workspace_size)
}

fn emit_run(app: &AppHandle, inner: &WorkflowEngineInner, run_id: &str) {
    let snapshot = inner
        .runs
        .lock()
        .ok()
        .and_then(|runs| runs.get(run_id).cloned());
    if let Some(snapshot) = snapshot {
        let _ = app.emit("workflow-run-status", snapshot);
    }
}

fn unix_time_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

pub fn setup_scheduler(app: AppHandle) {
    let inner = app.state::<WorkflowEngineState>().inner.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            scheduler_tick(&app, inner.clone()).await;
            tokio::time::sleep(Duration::from_secs(1)).await;
        }
    });
}

fn schedule_due(
    schedules: &mut HashMap<String, WorkflowScheduleRuntime>,
    workflow_id: &str,
    interval_minutes: u64,
    now: u64,
) -> bool {
    let interval_ms = interval_minutes.saturating_mul(60_000);
    schedule_due_at(
        schedules,
        workflow_id,
        format!("interval:{interval_minutes}"),
        now.saturating_add(interval_ms),
        now,
    )
}

fn parse_daily_time(value: &str) -> Option<(u32, u32)> {
    if value.len() != 5 || value.as_bytes().get(2) != Some(&b':') {
        return None;
    }
    let hour = value.get(0..2)?.parse::<u32>().ok()?;
    let minute = value.get(3..5)?.parse::<u32>().ok()?;
    (hour < 24 && minute < 60).then_some((hour, minute))
}

fn next_daily_run_at(now: u64, daily_time: &str) -> Option<u64> {
    let (hour, minute) = parse_daily_time(daily_time)?;
    let now_i64 = i64::try_from(now).ok()?;
    let now_local = Local.timestamp_millis_opt(now_i64).single()?;

    for offset in 0..=2 {
        let date = now_local.date_naive().checked_add_days(Days::new(offset))?;
        let naive = date.and_hms_opt(hour, minute, 0)?;
        let candidates = match Local.from_local_datetime(&naive) {
            LocalResult::Single(value) => vec![value],
            LocalResult::Ambiguous(first, second) => vec![first, second],
            LocalResult::None => continue,
        };
        if let Some(next) = candidates
            .into_iter()
            .map(|value| value.timestamp_millis())
            .filter(|value| *value > now_i64)
            .min()
        {
            return u64::try_from(next).ok();
        }
    }
    None
}

fn schedule_due_at(
    schedules: &mut HashMap<String, WorkflowScheduleRuntime>,
    workflow_id: &str,
    signature: String,
    next_run_at: u64,
    now: u64,
) -> bool {
    let runtime =
        schedules
            .entry(workflow_id.to_string())
            .or_insert_with(|| WorkflowScheduleRuntime {
                signature: signature.clone(),
                next_run_at,
            });
    if runtime.signature != signature {
        runtime.signature = signature;
        runtime.next_run_at = next_run_at;
        return false;
    }
    if now < runtime.next_run_at {
        return false;
    }
    runtime.next_run_at = next_run_at;
    true
}

fn daily_schedule_due(
    schedules: &mut HashMap<String, WorkflowScheduleRuntime>,
    workflow_id: &str,
    daily_time: &str,
    now: u64,
) -> bool {
    let Some(next_run_at) = next_daily_run_at(now, daily_time) else {
        return false;
    };
    schedule_due_at(
        schedules,
        workflow_id,
        format!("daily:{daily_time}"),
        next_run_at,
        now,
    )
}

async fn scheduler_tick(app: &AppHandle, inner: Arc<WorkflowEngineInner>) {
    let Ok(config) = config::load_config(app.clone()) else {
        return;
    };
    let now = unix_time_millis();
    let mut due = Vec::new();
    let mut configured = HashSet::new();

    if let Ok(mut schedules) = inner.schedules.lock() {
        for workflow in config.workflows {
            let Some(schedule) = workflow
                .schedule
                .as_ref()
                .filter(|schedule| schedule.enabled)
            else {
                continue;
            };
            if !workflow.enabled {
                continue;
            }

            configured.insert(workflow.id.clone());
            let is_due = match schedule.mode.as_str() {
                "interval"
                    if (MIN_SCHEDULE_INTERVAL_MINUTES..=MAX_SCHEDULE_INTERVAL_MINUTES)
                        .contains(&schedule.interval_minutes) =>
                {
                    schedule_due(&mut schedules, &workflow.id, schedule.interval_minutes, now)
                }
                "daily" if parse_daily_time(&schedule.daily_time).is_some() => {
                    daily_schedule_due(&mut schedules, &workflow.id, &schedule.daily_time, now)
                }
                _ => false,
            };
            if is_due {
                due.push(workflow);
            }
        }
        schedules.retain(|workflow_id, _| configured.contains(workflow_id));
    }

    for workflow in due {
        let _ = start_workflow_definition(
            app.clone(),
            inner.clone(),
            workflow,
            WorkflowRunTrigger::Schedule,
        );
    }
}

fn update_run<F>(app: &AppHandle, inner: &WorkflowEngineInner, run_id: &str, update: F)
where
    F: FnOnce(&mut WorkflowRun),
{
    if let Ok(mut runs) = inner.runs.lock() {
        if let Some(run) = runs.get_mut(run_id) {
            update(run);
        }
    }
    emit_run(app, inner, run_id);
}

fn update_step(
    app: &AppHandle,
    inner: &WorkflowEngineInner,
    run_id: &str,
    step_id: &str,
    status: WorkflowStepRunStatus,
    message: Option<String>,
) {
    update_run(app, inner, run_id, |run| {
        run.current_step_id = Some(step_id.to_string());
        if let Some(step) = run.steps.iter_mut().find(|step| step.step_id == step_id) {
            step.status = status;
            step.message = message;
        }
    });
}

fn attach_step_terminal(
    app: &AppHandle,
    inner: &WorkflowEngineInner,
    run_id: &str,
    step_id: &str,
    session_id: String,
) {
    update_run(app, inner, run_id, |run| {
        if let Some(step) = run.steps.iter_mut().find(|step| step.step_id == step_id) {
            step.terminal_session_id = Some(session_id);
        }
    });
}

fn is_cancelled(inner: &WorkflowEngineInner, run_id: &str) -> bool {
    inner
        .cancelled
        .lock()
        .map(|cancelled| cancelled.contains(run_id))
        .unwrap_or(true)
}

async fn cancellable_sleep(
    inner: &WorkflowEngineInner,
    run_id: &str,
    duration: Duration,
) -> Result<(), String> {
    let started = Instant::now();
    while started.elapsed() < duration {
        if is_cancelled(inner, run_id) {
            return Err(CANCELLED.into());
        }
        let remaining = duration.saturating_sub(started.elapsed());
        tokio::time::sleep(remaining.min(Duration::from_millis(100))).await;
    }
    Ok(())
}

fn evaluate_condition(
    condition: &StepCondition,
    previous: Option<&WorkflowStepRunStatus>,
) -> Result<bool, String> {
    match condition {
        StepCondition::Always => Ok(true),
        StepCondition::PreviousSuccess => {
            Ok(matches!(previous, Some(WorkflowStepRunStatus::Succeeded)))
        }
        StepCondition::PreviousFailed => {
            Ok(matches!(previous, Some(WorkflowStepRunStatus::Failed)))
        }
        StepCondition::Platform { platform } => {
            let current = match current_platform() {
                Platform::Macos => "macos",
                Platform::Windows => "windows",
                Platform::Other => "linux",
            };
            Ok(platform == current)
        }
        StepCondition::PathExists { path } => Ok(Path::new(path).exists()),
        StepCondition::EnvEquals { name, value } => {
            if name.is_empty()
                || !name
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric() || character == '_')
            {
                return Err("invalid environment variable name".into());
            }
            Ok(std::env::var(name)
                .map(|actual| actual == *value)
                .unwrap_or(false))
        }
    }
}

fn execute_action(app: &AppHandle, action: &Action) -> Result<(), String> {
    if let Action::Builtin { feature, .. } = action {
        return match feature.as_str() {
            "clipboard" => crate::builtins::clipboard::show_clipboard_window(app.clone()),
            "json" => crate::builtins::json::toggle_json_helper_window(app.clone()),
            "totp" => crate::builtins::totp::toggle_totp_window(app.clone()),
            "remotedesk" => crate::builtins::remotedesk::toggle_remotedesk_window(app.clone()),
            "terminal" => crate::builtins::terminal::toggle_terminal_window(app.clone()),
            "screenshotai" => crate::builtins::screenshotai::show_screenshotai_window(app.clone()),
            "screenshot" => crate::builtins::screenshot::toggle_screenshot_window(app.clone()),
            "webaccounts" => crate::builtins::webaccounts::toggle_webaccounts_window(app.clone()),
            "quickmemory" => crate::builtins::quickmemory::toggle_quickmemory_window(app.clone()),
            "projecttasks" => {
                crate::builtins::projecttasks::toggle_projecttasks_window(app.clone())
            }
            _ => Err(format!("unknown builtin feature: {feature}")),
        };
    }
    if let Action::Plugin {
        plugin_id,
        action_id,
        ..
    } = action
    {
        return crate::plugin_manager::open_plugin_window(
            app.clone(),
            plugin_id.clone(),
            action_id.clone(),
        );
    }
    let terminal_state = app.state::<TerminalState>();
    let value = serde_json::to_value(action).map_err(|error| error.to_string())?;
    actions::execute_action_value(app, value, terminal_state.inner())
}

fn script_command_spec(action: &Action) -> Result<(String, Vec<String>), String> {
    let Action::Script {
        shell,
        content,
        file,
        ..
    } = action
    else {
        return Err("managed process execution requires a script action".into());
    };
    let source = content
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .or(file.as_deref())
        .ok_or_else(|| "script content or file is required".to_string())?;

    let spec = match shell.as_str() {
        "powershell" => {
            let program = if cfg!(target_os = "windows") {
                "powershell.exe"
            } else {
                "pwsh"
            };
            (
                program.to_string(),
                vec!["-NoProfile".into(), "-Command".into(), source.into()],
            )
        }
        "cmd" | "bat" => ("cmd".into(), vec!["/C".into(), source.into()]),
        "wsl" => (
            "wsl".into(),
            vec!["-e".into(), "sh".into(), "-lc".into(), source.into()],
        ),
        _ => {
            let program = if cfg!(target_os = "macos") {
                "/bin/zsh"
            } else {
                "/bin/sh"
            };
            (program.to_string(), vec!["-lc".into(), source.into()])
        }
    };
    Ok(spec)
}

fn uses_managed_script_process(action: &Action) -> bool {
    matches!(action, Action::Script { .. })
}

async fn run_script_to_exit(
    app: &AppHandle,
    inner: &WorkflowEngineInner,
    run_id: &str,
    step_id: &str,
    action: &Action,
    success_codes: &[i32],
    timeout_ms: u64,
) -> Result<Option<String>, String> {
    let (cmd, args) = script_command_spec(action)?;
    let terminal_state = app.state::<TerminalState>();
    let session_id = format!("workflow-{run_id}-{step_id}");
    attach_step_terminal(app, inner, run_id, step_id, session_id.clone());
    let session_id_for_cleanup = session_id.clone();
    let (mut child, captured_output, reader_done) = crate::builtins::terminal::spawn_pty_process(
        app.clone(),
        &terminal_state,
        session_id,
        cmd,
        args,
        96,
        20,
    )?;
    let mut killer = child.clone_killer();
    let wait = tokio::task::spawn_blocking(move || child.wait().map_err(|error| error.to_string()));
    tokio::pin!(wait);

    tokio::select! {
        result = &mut wait => {
            let status = result
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())?;
            let code = status.exit_code() as i32;
            wait_for_terminal_reader(reader_done).await;
            let output = captured_output
                .lock()
                .ok()
                .and_then(|output| process_output_tail(&output));
            crate::builtins::terminal::remove_pty_session(&terminal_state, &session_id_for_cleanup);
            if success_codes.contains(&code) {
                Ok(output)
            } else {
                Err(match output {
                    Some(detail) => format!("script exited with code {code}: {detail}"),
                    None => format!("script exited with code {code}"),
                })
            }
        }
        _ = cancellable_sleep(inner, run_id, Duration::from_millis(timeout_ms)) => {
            if is_cancelled(inner, run_id) {
                let _ = killer.kill();
                crate::builtins::terminal::remove_pty_session(&terminal_state, &session_id_for_cleanup);
                Err(CANCELLED.into())
            } else {
                let _ = killer.kill();
                crate::builtins::terminal::remove_pty_session(&terminal_state, &session_id_for_cleanup);
                Err(format!("script timed out after {timeout_ms} ms"))
            }
        }
    }
}

async fn wait_for_terminal_reader(reader_done: Receiver<()>) {
    let _ =
        tokio::task::spawn_blocking(move || reader_done.recv_timeout(Duration::from_secs(2))).await;
}

fn captured_script_output(output: &Arc<Mutex<Vec<u8>>>) -> Option<String> {
    output
        .lock()
        .ok()
        .and_then(|output| process_output_tail(&output))
}

fn script_exit_error(code: i32, output: Option<String>) -> String {
    match output {
        Some(detail) => format!("script exited with code {code}: {detail}"),
        None => format!("script exited with code {code}"),
    }
}

fn detach_script_process(
    mut child: Box<dyn portable_pty::Child + Send + Sync>,
    reader_done: Receiver<()>,
) {
    std::thread::spawn(move || {
        let _ = child.wait();
        let _ = reader_done.recv_timeout(Duration::from_secs(2));
    });
}

async fn run_script_until_started(
    app: &AppHandle,
    inner: &WorkflowEngineInner,
    run_id: &str,
    step_id: &str,
    action: &Action,
    stabilization_ms: u64,
) -> Result<Option<String>, String> {
    let (cmd, args) = script_command_spec(action)?;
    let terminal_state = app.state::<TerminalState>();
    let session_id = format!("workflow-{run_id}-{step_id}");
    attach_step_terminal(app, inner, run_id, step_id, session_id.clone());
    let (mut child, output, reader_done) = crate::builtins::terminal::spawn_pty_process(
        app.clone(),
        &terminal_state,
        session_id,
        cmd,
        args,
        96,
        20,
    )?;
    let mut killer = child.clone_killer();
    let started = Instant::now();
    let stabilization = Duration::from_millis(stabilization_ms);

    while started.elapsed() < stabilization {
        if is_cancelled(inner, run_id) {
            let _ = killer.kill();
            return Err(CANCELLED.into());
        }
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            let code = status.exit_code() as i32;
            wait_for_terminal_reader(reader_done).await;
            let captured = captured_script_output(&output);
            return if code == 0 {
                Ok(captured)
            } else {
                Err(script_exit_error(code, captured))
            };
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    let captured = captured_script_output(&output);
    detach_script_process(child, reader_done);
    Ok(captured)
}

async fn run_script_until_port_ready(
    app: &AppHandle,
    inner: &WorkflowEngineInner,
    run_id: &str,
    step_id: &str,
    action: &Action,
    host: &str,
    port: u16,
    interval_ms: u64,
    timeout_ms: u64,
) -> Result<Option<String>, String> {
    let (cmd, args) = script_command_spec(action)?;
    let terminal_state = app.state::<TerminalState>();
    let session_id = format!("workflow-{run_id}-{step_id}");
    attach_step_terminal(app, inner, run_id, step_id, session_id.clone());
    let (child, output, reader_done) = crate::builtins::terminal::spawn_pty_process(
        app.clone(),
        &terminal_state,
        session_id,
        cmd,
        args,
        96,
        20,
    )?;
    let mut child = Some(child);
    let mut reader_done = Some(reader_done);
    let mut killer = child.as_mut().expect("script child").clone_killer();
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);

    while started.elapsed() < timeout {
        if is_cancelled(inner, run_id) {
            let _ = killer.kill();
            return Err(CANCELLED.into());
        }
        if TcpStream::connect((host, port)).await.is_ok() {
            let captured = captured_script_output(&output);
            if let (Some(child), Some(reader_done)) = (child.take(), reader_done.take()) {
                detach_script_process(child, reader_done);
            }
            return Ok(captured);
        }
        if let Some(active_child) = child.as_mut() {
            if let Some(status) = active_child.try_wait().map_err(|error| error.to_string())? {
                let code = status.exit_code() as i32;
                child = None;
                if let Some(done) = reader_done.take() {
                    wait_for_terminal_reader(done).await;
                }
                if code != 0 {
                    return Err(script_exit_error(code, captured_script_output(&output)));
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    }

    if child.is_some() {
        let _ = killer.kill();
    }
    Err(format!(
        "port {host}:{port} was not ready after {timeout_ms} ms"
    ))
}

async fn run_script_for_duration(
    app: &AppHandle,
    inner: &WorkflowEngineInner,
    run_id: &str,
    step_id: &str,
    action: &Action,
    duration_ms: u64,
) -> Result<Option<String>, String> {
    let (cmd, args) = script_command_spec(action)?;
    let terminal_state = app.state::<TerminalState>();
    let session_id = format!("workflow-{run_id}-{step_id}");
    attach_step_terminal(app, inner, run_id, step_id, session_id.clone());
    let (child, output, reader_done) = crate::builtins::terminal::spawn_pty_process(
        app.clone(),
        &terminal_state,
        session_id,
        cmd,
        args,
        96,
        20,
    )?;
    let mut child = Some(child);
    let mut reader_done = Some(reader_done);
    let mut killer = child.as_mut().expect("script child").clone_killer();
    let started = Instant::now();
    let duration = Duration::from_millis(duration_ms);

    while started.elapsed() < duration {
        if is_cancelled(inner, run_id) {
            let _ = killer.kill();
            return Err(CANCELLED.into());
        }
        if let Some(active_child) = child.as_mut() {
            if let Some(status) = active_child.try_wait().map_err(|error| error.to_string())? {
                let code = status.exit_code() as i32;
                child = None;
                if let Some(done) = reader_done.take() {
                    wait_for_terminal_reader(done).await;
                }
                if code != 0 {
                    return Err(script_exit_error(code, captured_script_output(&output)));
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    let captured = captured_script_output(&output);
    if let (Some(child), Some(reader_done)) = (child.take(), reader_done.take()) {
        detach_script_process(child, reader_done);
    }
    Ok(captured)
}

const MAX_PROCESS_OUTPUT_CHARS: usize = 16 * 1024;
const PROCESS_OUTPUT_HEAD_CHARS: usize = 4 * 1024;
const PROCESS_OUTPUT_OMISSION: &str = "\n... 输出过长，已省略中间内容 ...\n";

fn normalize_terminal_output(text: &str) -> String {
    let mut lines = String::with_capacity(text.len());
    let mut current_line = String::new();
    let mut characters = text.chars().peekable();

    while let Some(character) = characters.next() {
        match character {
            '\u{1b}' => match characters.next() {
                Some('[') => {
                    for control in characters.by_ref() {
                        if ('@'..='~').contains(&control) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    while let Some(control) = characters.next() {
                        if control == '\u{7}' {
                            break;
                        }
                        if control == '\u{1b}' && characters.peek() == Some(&'\\') {
                            characters.next();
                            break;
                        }
                    }
                }
                Some(_) | None => {}
            },
            '\r' => {
                if characters.peek() == Some(&'\n') {
                    characters.next();
                    lines.push_str(&current_line);
                    lines.push('\n');
                    current_line.clear();
                } else {
                    current_line.clear();
                }
            }
            '\n' => {
                lines.push_str(&current_line);
                lines.push('\n');
                current_line.clear();
            }
            '\u{8}' => {
                current_line.pop();
            }
            '\t' => current_line.push('\t'),
            value if value.is_control() => {}
            value => current_line.push(value),
        }
    }
    lines.push_str(&current_line);
    lines
}

fn process_output_tail(output: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(output);
    let normalized = normalize_terminal_output(&text);
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return None;
    }

    let chars = trimmed.chars().collect::<Vec<_>>();
    if chars.len() <= MAX_PROCESS_OUTPUT_CHARS {
        return Some(trimmed.into());
    }

    let tail_chars = MAX_PROCESS_OUTPUT_CHARS - PROCESS_OUTPUT_HEAD_CHARS;
    let mut summarized =
        String::with_capacity(MAX_PROCESS_OUTPUT_CHARS + PROCESS_OUTPUT_OMISSION.len());
    summarized.extend(chars.iter().take(PROCESS_OUTPUT_HEAD_CHARS));
    summarized.push_str(PROCESS_OUTPUT_OMISSION);
    let mut tail = chars.iter().rev().take(tail_chars).collect::<Vec<_>>();
    tail.reverse();
    summarized.extend(tail);
    Some(summarized)
}

async fn wait_for_port(
    inner: &WorkflowEngineInner,
    run_id: &str,
    host: &str,
    port: u16,
    interval_ms: u64,
    timeout_ms: u64,
) -> Result<(), String> {
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    while started.elapsed() < timeout {
        if is_cancelled(inner, run_id) {
            return Err(CANCELLED.into());
        }
        if TcpStream::connect((host, port)).await.is_ok() {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    }
    Err(format!(
        "port {host}:{port} was not ready after {timeout_ms} ms"
    ))
}

async fn wait_for_manual(
    app: &AppHandle,
    inner: &WorkflowEngineInner,
    run_id: &str,
    step: &WorkflowStep,
    timeout_ms: Option<u64>,
) -> Result<(), String> {
    let _ = app.emit(
        "workflow-manual-confirmation-required",
        serde_json::json!({ "runId": run_id, "stepId": step.id, "stepName": step.name }),
    );
    let started = Instant::now();
    loop {
        if is_cancelled(inner, run_id) {
            return Err(CANCELLED.into());
        }
        let key = (run_id.to_string(), step.id.clone());
        if inner
            .manual_confirmations
            .lock()
            .map(|mut confirmations| confirmations.remove(&key))
            .unwrap_or(false)
        {
            return Ok(());
        }
        if timeout_ms
            .map(|timeout| started.elapsed() >= Duration::from_millis(timeout))
            .unwrap_or(false)
        {
            return Err("manual confirmation timed out".into());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn execute_step(
    app: &AppHandle,
    inner: &WorkflowEngineInner,
    run_id: &str,
    step: &WorkflowStep,
) -> Result<Option<String>, String> {
    if uses_managed_script_process(&step.action) {
        return match &step.completion {
            CompletionRule::ActionResolved => {
                run_script_to_exit(
                    app,
                    inner,
                    run_id,
                    &step.id,
                    &step.action,
                    &[0],
                    DEFAULT_SCRIPT_TIMEOUT_MS,
                )
                .await
            }
            CompletionRule::ProcessStarted {
                stabilization_ms, ..
            } => {
                run_script_until_started(
                    app,
                    inner,
                    run_id,
                    &step.id,
                    &step.action,
                    *stabilization_ms,
                )
                .await
            }
            CompletionRule::ProcessExit {
                success_codes,
                timeout_ms,
            } => {
                run_script_to_exit(
                    app,
                    inner,
                    run_id,
                    &step.id,
                    &step.action,
                    success_codes,
                    *timeout_ms,
                )
                .await
            }
            CompletionRule::PortReady {
                host,
                port,
                interval_ms,
                timeout_ms,
            } => {
                run_script_until_port_ready(
                    app,
                    inner,
                    run_id,
                    &step.id,
                    &step.action,
                    host,
                    *port,
                    *interval_ms,
                    *timeout_ms,
                )
                .await
            }
            CompletionRule::Timer { duration_ms } => {
                run_script_for_duration(app, inner, run_id, &step.id, &step.action, *duration_ms)
                    .await
            }
            CompletionRule::Manual { timeout_ms } => {
                let output = run_script_to_exit(
                    app,
                    inner,
                    run_id,
                    &step.id,
                    &step.action,
                    &[0],
                    timeout_ms.unwrap_or(DEFAULT_SCRIPT_TIMEOUT_MS),
                )
                .await?;
                wait_for_manual(app, inner, run_id, step, *timeout_ms).await?;
                Ok(output)
            }
            CompletionRule::WindowReady { .. } => {
                Err("window_ready adapter is not available".into())
            }
            CompletionRule::UrlReady { .. } => Err("url_ready adapter is not available".into()),
            CompletionRule::ConnectionReady { .. } => {
                Err("connection_ready adapter is not available".into())
            }
        };
    }

    match &step.completion {
        CompletionRule::ActionResolved => execute_action(app, &step.action).map(|_| None),
        CompletionRule::ProcessStarted {
            stabilization_ms, ..
        } => {
            execute_action(app, &step.action)?;
            cancellable_sleep(inner, run_id, Duration::from_millis(*stabilization_ms))
                .await
                .map(|_| None)
        }
        CompletionRule::ProcessExit {
            success_codes,
            timeout_ms,
        } => {
            run_script_to_exit(
                app,
                inner,
                run_id,
                &step.id,
                &step.action,
                success_codes,
                *timeout_ms,
            )
            .await
        }
        CompletionRule::PortReady {
            host,
            port,
            interval_ms,
            timeout_ms,
        } => {
            execute_action(app, &step.action)?;
            wait_for_port(inner, run_id, host, *port, *interval_ms, *timeout_ms)
                .await
                .map(|_| None)
        }
        CompletionRule::Timer { duration_ms } => {
            execute_action(app, &step.action)?;
            cancellable_sleep(inner, run_id, Duration::from_millis(*duration_ms))
                .await
                .map(|_| None)
        }
        CompletionRule::Manual { timeout_ms } => {
            execute_action(app, &step.action)?;
            wait_for_manual(app, inner, run_id, step, *timeout_ms)
                .await
                .map(|_| None)
        }
        CompletionRule::WindowReady { .. } => Err("window_ready adapter is not available".into()),
        CompletionRule::UrlReady { .. } => Err("url_ready adapter is not available".into()),
        CompletionRule::ConnectionReady { .. } => {
            Err("connection_ready adapter is not available".into())
        }
    }
}

async fn execute_workflow(
    app: AppHandle,
    inner: Arc<WorkflowEngineInner>,
    workflow: WorkflowDefinition,
    run_id: String,
) {
    update_run(&app, &inner, &run_id, |run| {
        run.status = WorkflowRunStatus::Running;
        run.message = Some("workflow started".into());
    });

    let mut previous_status: Option<WorkflowStepRunStatus> = None;
    for step in &workflow.steps {
        if is_cancelled(&inner, &run_id) {
            break;
        }
        if !step.enabled {
            update_step(
                &app,
                &inner,
                &run_id,
                &step.id,
                WorkflowStepRunStatus::Skipped,
                Some("step disabled".into()),
            );
            previous_status = Some(WorkflowStepRunStatus::Skipped);
            continue;
        }

        match evaluate_condition(&step.condition, previous_status.as_ref()) {
            Ok(false) => {
                update_step(
                    &app,
                    &inner,
                    &run_id,
                    &step.id,
                    WorkflowStepRunStatus::Skipped,
                    Some("condition not met".into()),
                );
                previous_status = Some(WorkflowStepRunStatus::Skipped);
                continue;
            }
            Err(error) => {
                update_step(
                    &app,
                    &inner,
                    &run_id,
                    &step.id,
                    WorkflowStepRunStatus::Failed,
                    Some(error),
                );
                break;
            }
            Ok(true) => {}
        }

        if step.delay_ms > 0
            && cancellable_sleep(&inner, &run_id, Duration::from_millis(step.delay_ms))
                .await
                .is_err()
        {
            break;
        }

        let waiting = matches!(
            step.completion,
            CompletionRule::PortReady { .. }
                | CompletionRule::Timer { .. }
                | CompletionRule::Manual { .. }
                | CompletionRule::ProcessExit { .. }
        );
        update_step(
            &app,
            &inner,
            &run_id,
            &step.id,
            if waiting {
                WorkflowStepRunStatus::Waiting
            } else {
                WorkflowStepRunStatus::Running
            },
            Some("executing step".into()),
        );
        if waiting {
            update_run(&app, &inner, &run_id, |run| {
                run.status = WorkflowRunStatus::Waiting;
            });
        }

        match execute_step(&app, &inner, &run_id, step).await {
            Ok(output) => {
                update_step(
                    &app,
                    &inner,
                    &run_id,
                    &step.id,
                    WorkflowStepRunStatus::Succeeded,
                    Some("step completed".into()),
                );
                if let Some(output) = output {
                    update_run(&app, &inner, &run_id, |run| {
                        if let Some(step_run) =
                            run.steps.iter_mut().find(|entry| entry.step_id == step.id)
                        {
                            step_run.output = Some(output);
                        }
                    });
                }
                update_run(&app, &inner, &run_id, |run| {
                    run.status = WorkflowRunStatus::Running;
                });
                previous_status = Some(WorkflowStepRunStatus::Succeeded);
            }
            Err(error) if error == CANCELLED => {
                update_step(
                    &app,
                    &inner,
                    &run_id,
                    &step.id,
                    WorkflowStepRunStatus::Cancelled,
                    Some("step cancelled".into()),
                );
                break;
            }
            Err(error) => {
                update_step(
                    &app,
                    &inner,
                    &run_id,
                    &step.id,
                    WorkflowStepRunStatus::Failed,
                    Some(error.clone()),
                );
                previous_status = Some(WorkflowStepRunStatus::Failed);
                let policy = step
                    .on_failure
                    .as_deref()
                    .unwrap_or(workflow.failure_policy.as_str());
                if policy != "continue" {
                    update_run(&app, &inner, &run_id, |run| {
                        run.status = WorkflowRunStatus::Failed;
                        run.message = Some(format!("{} · {}", step.name, error));
                    });
                    return;
                }
            }
        }
    }

    if is_cancelled(&inner, &run_id) {
        update_run(&app, &inner, &run_id, |run| {
            run.status = WorkflowRunStatus::Cancelled;
            run.message = Some("workflow cancelled".into());
        });
    } else {
        let failed = inner
            .runs
            .lock()
            .ok()
            .and_then(|runs| runs.get(&run_id).cloned())
            .map(|run| {
                run.steps
                    .iter()
                    .any(|step| step.status == WorkflowStepRunStatus::Failed)
            })
            .unwrap_or(true);
        update_run(&app, &inner, &run_id, |run| {
            run.status = if failed {
                WorkflowRunStatus::Failed
            } else {
                WorkflowRunStatus::Succeeded
            };
            run.message = Some(if failed {
                "workflow completed with failures".into()
            } else {
                "workflow completed".into()
            });
            run.current_step_id = None;
        });
    }
}

fn start_workflow_definition(
    app: AppHandle,
    inner: Arc<WorkflowEngineInner>,
    workflow: WorkflowDefinition,
    trigger: WorkflowRunTrigger,
) -> Result<WorkflowRun, String> {
    if !workflow.enabled {
        return Err("workflow is disabled".into());
    }
    let report = validate_workflow_definition(&workflow);
    if !report.valid {
        return Err(report.errors.join("; "));
    }

    let already_running = inner
        .runs
        .lock()
        .map_err(|_| "workflow state lock poisoned".to_string())?
        .values()
        .any(|run| {
            run.workflow_id == workflow.id
                && matches!(
                    run.status,
                    WorkflowRunStatus::Pending
                        | WorkflowRunStatus::Running
                        | WorkflowRunStatus::Waiting
                )
        });
    if already_running {
        return Err("workflow is already running".into());
    }

    let run = WorkflowRun {
        id: generate_id(),
        workflow_id: workflow.id.clone(),
        workflow_name: workflow.name.clone(),
        started_at: unix_time_millis(),
        trigger,
        status: WorkflowRunStatus::Pending,
        current_step_id: None,
        steps: workflow
            .steps
            .iter()
            .map(|step| WorkflowStepRun {
                step_id: step.id.clone(),
                name: step.name.clone(),
                status: WorkflowStepRunStatus::Pending,
                message: None,
                output: None,
                terminal_session_id: None,
            })
            .collect(),
        message: Some("workflow queued".into()),
    };
    inner
        .runs
        .lock()
        .map_err(|_| "workflow state lock poisoned".to_string())?
        .insert(run.id.clone(), run.clone());
    emit_run(&app, &inner, &run.id);

    let run_id = run.id.clone();
    tauri::async_runtime::spawn(execute_workflow(app, inner, workflow, run_id));
    Ok(run)
}

#[tauri::command]
pub async fn run_workflow(
    app: AppHandle,
    workflow_id: String,
    state: tauri::State<'_, WorkflowEngineState>,
) -> Result<WorkflowRun, String> {
    let config = config::load_config(app.clone())?;
    let workflow = config
        .workflows
        .into_iter()
        .find(|workflow| workflow.id == workflow_id)
        .ok_or_else(|| "workflow not found".to_string())?;
    start_workflow_definition(
        app,
        state.inner.clone(),
        workflow,
        WorkflowRunTrigger::Manual,
    )
}

fn standalone_step_workflow(
    mut workflow: WorkflowDefinition,
    step_id: &str,
) -> Result<WorkflowDefinition, String> {
    if !workflow.enabled {
        return Err("workflow is disabled".into());
    }
    let mut step = workflow
        .steps
        .iter()
        .find(|step| step.id == step_id)
        .cloned()
        .ok_or_else(|| "workflow step not found".to_string())?;
    if !step.enabled {
        return Err("workflow step is disabled".into());
    }

    step.enabled = true;
    step.condition = StepCondition::Always;
    step.delay_ms = 0;
    workflow.name = format!("{} · {}", workflow.name, step.name);
    workflow.failure_policy = "stop".into();
    workflow.schedule = None;
    workflow.steps = vec![step];
    Ok(workflow)
}

#[tauri::command]
pub async fn run_workflow_step(
    app: AppHandle,
    workflow_id: String,
    step_id: String,
    state: tauri::State<'_, WorkflowEngineState>,
) -> Result<WorkflowRun, String> {
    let config = config::load_config(app.clone())?;
    let workflow = config
        .workflows
        .into_iter()
        .find(|workflow| workflow.id == workflow_id)
        .ok_or_else(|| "workflow not found".to_string())?;
    let workflow = standalone_step_workflow(workflow, &step_id)?;

    start_workflow_definition(app, state.inner.clone(), workflow, WorkflowRunTrigger::Step)
}

#[tauri::command]
pub fn get_workflow_run(
    run_id: String,
    state: tauri::State<'_, WorkflowEngineState>,
) -> Result<WorkflowRun, String> {
    state
        .inner
        .runs
        .lock()
        .map_err(|_| "workflow state lock poisoned".to_string())?
        .get(&run_id)
        .cloned()
        .ok_or_else(|| "workflow run not found".to_string())
}

#[tauri::command]
pub fn list_workflow_runs(
    state: tauri::State<'_, WorkflowEngineState>,
) -> Result<Vec<WorkflowRun>, String> {
    let mut runs = state
        .inner
        .runs
        .lock()
        .map_err(|_| "workflow state lock poisoned".to_string())?
        .values()
        .cloned()
        .collect::<Vec<_>>();
    runs.sort_by(|left, right| left.started_at.cmp(&right.started_at));
    Ok(runs)
}

#[tauri::command]
pub fn cancel_workflow_run(
    run_id: String,
    state: tauri::State<'_, WorkflowEngineState>,
) -> Result<(), String> {
    if !state
        .inner
        .runs
        .lock()
        .map_err(|_| "workflow state lock poisoned".to_string())?
        .contains_key(&run_id)
    {
        return Err("workflow run not found".into());
    }
    state
        .inner
        .cancelled
        .lock()
        .map_err(|_| "workflow state lock poisoned".to_string())?
        .insert(run_id);
    Ok(())
}

#[tauri::command]
pub fn confirm_workflow_step(
    run_id: String,
    step_id: String,
    state: tauri::State<'_, WorkflowEngineState>,
) -> Result<(), String> {
    state
        .inner
        .manual_confirmations
        .lock()
        .map_err(|_| "workflow state lock poisoned".to_string())?
        .insert((run_id, step_id));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        binding_workspace_size, daily_schedule_due, evaluate_condition, next_daily_run_at,
        parse_daily_time, process_output_tail, schedule_due, script_command_spec,
        standalone_step_workflow, unix_time_millis, uses_managed_script_process,
        validate_workflow_definition, workflow_workspace_size, WorkflowScheduleRuntime,
        WorkflowStepRunStatus, MAX_PROCESS_OUTPUT_CHARS, PROCESS_OUTPUT_OMISSION,
    };
    use crate::types::{
        Action, CompletionRule, StepCondition, WorkflowDefinition, WorkflowSchedule, WorkflowStep,
    };
    use std::collections::HashMap;

    fn script_workflow(completion: CompletionRule) -> WorkflowDefinition {
        WorkflowDefinition {
            id: "workflow-1".into(),
            name: "Test workflow".into(),
            description: String::new(),
            enabled: true,
            failure_policy: "stop".into(),
            schedule: None,
            steps: vec![WorkflowStep {
                id: "step-1".into(),
                name: "Echo".into(),
                enabled: true,
                action: Action::Script {
                    name: "Echo".into(),
                    icon: None,
                    shell: "terminal".into(),
                    content: Some("echo hello".into()),
                    file: None,
                },
                condition: StepCondition::Always,
                completion,
                delay_ms: 0,
                on_failure: None,
            }],
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn validates_script_process_exit() {
        let workflow = script_workflow(CompletionRule::ProcessExit {
            success_codes: vec![0],
            timeout_ms: 5_000,
        });
        assert!(validate_workflow_definition(&workflow).valid);
    }

    #[test]
    fn validates_enabled_schedule_interval() {
        let mut workflow = script_workflow(CompletionRule::ActionResolved);
        workflow.schedule = Some(WorkflowSchedule {
            enabled: true,
            mode: "interval".into(),
            interval_minutes: 0,
            daily_time: "09:00".into(),
        });
        assert!(!validate_workflow_definition(&workflow).valid);

        workflow.schedule = Some(WorkflowSchedule {
            enabled: true,
            mode: "interval".into(),
            interval_minutes: 30,
            daily_time: "09:00".into(),
        });
        assert!(validate_workflow_definition(&workflow).valid);
    }

    #[test]
    fn validates_daily_schedule_time() {
        let mut workflow = script_workflow(CompletionRule::ActionResolved);
        workflow.schedule = Some(WorkflowSchedule {
            enabled: true,
            mode: "daily".into(),
            interval_minutes: 60,
            daily_time: "24:00".into(),
        });
        assert!(!validate_workflow_definition(&workflow).valid);

        workflow.schedule = Some(WorkflowSchedule {
            enabled: true,
            mode: "daily".into(),
            interval_minutes: 60,
            daily_time: "08:30".into(),
        });
        assert!(validate_workflow_definition(&workflow).valid);
        assert_eq!(parse_daily_time("08:30"), Some((8, 30)));
        assert_eq!(parse_daily_time("8:30"), None);
    }

    #[test]
    fn daily_schedule_calculates_a_future_local_start() {
        let now = unix_time_millis();
        let next = next_daily_run_at(now, "09:00").expect("next daily start");
        assert!(next > now);
        assert!(next - now <= 25 * 60 * 60 * 1_000);
    }

    #[test]
    fn daily_schedule_advances_after_it_becomes_due() {
        let now = unix_time_millis();
        let mut schedules = HashMap::from([(
            "workflow-1".into(),
            WorkflowScheduleRuntime {
                signature: "daily:09:00".into(),
                next_run_at: now,
            },
        )]);
        assert!(daily_schedule_due(
            &mut schedules,
            "workflow-1",
            "09:00",
            now
        ));
        assert!(schedules["workflow-1"].next_run_at > now);
        assert!(!daily_schedule_due(
            &mut schedules,
            "workflow-1",
            "09:00",
            now
        ));
    }

    #[test]
    fn interval_schedule_starts_after_the_configured_delay() {
        let mut schedules = HashMap::new();
        assert!(!schedule_due(&mut schedules, "workflow-1", 1, 1_000));
        assert!(!schedule_due(&mut schedules, "workflow-1", 1, 60_999));
        assert!(schedule_due(&mut schedules, "workflow-1", 1, 61_000));
        assert!(!schedule_due(&mut schedules, "workflow-1", 2, 62_000));
        assert!(schedule_due(&mut schedules, "workflow-1", 2, 182_000));
    }

    #[test]
    fn standalone_step_ignores_sequence_condition_and_delay() {
        let mut workflow = script_workflow(CompletionRule::ActionResolved);
        workflow.schedule = Some(WorkflowSchedule {
            enabled: true,
            mode: "interval".into(),
            interval_minutes: 30,
            daily_time: "09:00".into(),
        });
        workflow.steps[0].condition = StepCondition::PreviousSuccess;
        workflow.steps[0].delay_ms = 5_000;

        let standalone = standalone_step_workflow(workflow, "step-1").expect("standalone step");
        assert_eq!(standalone.steps.len(), 1);
        assert!(matches!(
            standalone.steps[0].condition,
            StepCondition::Always
        ));
        assert_eq!(standalone.steps[0].delay_ms, 0);
        assert!(standalone.schedule.is_none());
    }

    #[test]
    fn routes_terminal_scripts_to_the_managed_process_runner() {
        let workflow = script_workflow(CompletionRule::ActionResolved);
        let action = &workflow.steps[0].action;
        assert!(uses_managed_script_process(action));

        let (program, args) = script_command_spec(action).expect("script command");
        assert!(program.ends_with("zsh") || program.ends_with("sh"));
        assert_eq!(args, vec!["-lc", "echo hello"]);
    }

    #[test]
    fn rejects_unavailable_completion_adapter() {
        let workflow = script_workflow(CompletionRule::UrlReady {
            url_pattern: "https://example.com".into(),
            timeout_ms: 5_000,
        });
        assert!(!validate_workflow_definition(&workflow).valid);
    }

    #[test]
    fn evaluates_previous_status_conditions() {
        assert!(evaluate_condition(
            &StepCondition::PreviousSuccess,
            Some(&WorkflowStepRunStatus::Succeeded)
        )
        .unwrap());
        assert!(!evaluate_condition(
            &StepCondition::PreviousFailed,
            Some(&WorkflowStepRunStatus::Succeeded)
        )
        .unwrap());
    }

    #[test]
    fn accepts_builtin_and_plugin_actions() {
        let mut workflow = script_workflow(CompletionRule::ActionResolved);
        workflow.steps[0].action = Action::Builtin {
            name: "JSON".into(),
            feature: "json".into(),
        };
        workflow.steps.push(WorkflowStep {
            id: "step-2".into(),
            name: "Plugin".into(),
            enabled: true,
            action: Action::Plugin {
                name: "Plugin".into(),
                icon: None,
                plugin_id: "devlauncher.test".into(),
                action_id: "open".into(),
            },
            condition: StepCondition::PreviousSuccess,
            completion: CompletionRule::ActionResolved,
            delay_ms: 0,
            on_failure: None,
        });

        assert!(validate_workflow_definition(&workflow).valid);
    }

    #[test]
    fn workflow_workspace_stays_inside_small_desktop_bounds() {
        assert_eq!(workflow_workspace_size(1280.0, 720.0), (1180.0, 610.0));
        assert_eq!(workflow_workspace_size(1440.0, 900.0), (1180.0, 680.0));
    }

    #[test]
    fn binding_workspace_stays_inside_small_desktop_bounds() {
        assert_eq!(binding_workspace_size(1280.0, 720.0), (980.0, 610.0));
        assert_eq!(binding_workspace_size(1440.0, 900.0), (980.0, 680.0));
    }

    #[test]
    fn process_output_tail_preserves_failure_detail() {
        assert_eq!(
            process_output_tail("工作区有未提交修改\n".as_bytes()),
            Some("工作区有未提交修改".into())
        );
        assert_eq!(process_output_tail(b" \n\t"), None);
    }

    #[test]
    fn process_output_tail_normalizes_terminal_control_sequences() {
        let output = "准备中\r处理中\u{1b}[2K\r完成\n\u{1b}[31m中文错误\u{1b}[0m\n";

        assert_eq!(
            process_output_tail(output.as_bytes()),
            Some("完成\n中文错误".into())
        );
    }

    #[test]
    fn process_output_tail_preserves_both_ends_when_output_is_long() {
        let output = format!("BEGIN:{}:END", "x".repeat(MAX_PROCESS_OUTPUT_CHARS + 1));
        let summarized = process_output_tail(output.as_bytes()).expect("output");

        assert!(summarized.starts_with("BEGIN:"));
        assert!(summarized.contains(PROCESS_OUTPUT_OMISSION));
        assert!(summarized.ends_with(":END"));
    }
}
