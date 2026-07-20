use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

use crate::window_pinning;

/// Safety: portable-pty's concrete MasterPty implementations
/// (ConPtyMaster on Windows, UnixMasterPty on Unix) use thread-safe
/// OS handles (HANDLE / fd) and are safe to move across threads.
struct SendableMaster(Box<dyn portable_pty::MasterPty>);
unsafe impl Send for SendableMaster {}
unsafe impl Sync for SendableMaster {}

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    master: SendableMaster,
}

pub struct TerminalState {
    pub sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    outputs: Arc<Mutex<HashMap<String, Arc<Mutex<Vec<u8>>>>>>,
    /// Command staged by `terminal_run`; consumed once by `terminal_take_pending_cmd`.
    pub pending_cmd: Arc<Mutex<Option<String>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalDataChunk {
    offset: usize,
    data: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSnapshot {
    data: String,
    offset: usize,
    active: bool,
}

const MAX_OUTPUT_SNAPSHOTS: usize = 64;

pub fn setup(app: &mut tauri::App) {
    app.manage(TerminalState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        outputs: Arc::new(Mutex::new(HashMap::new())),
        pending_cmd: Arc::new(Mutex::new(None)),
    });
}

fn apply_pin_state(app: &tauri::AppHandle, label: &str) {
    let _ = window_pinning::apply_window_pin_state(app, label);
}

/// Spawn a PTY process and begin streaming its output as Tauri events.
#[tauri::command]
pub fn terminal_spawn(
    app: tauri::AppHandle,
    session_id: String,
    cmd: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let cwd = resolve_terminal_cwd(cwd)?;
    spawn_pty_process_in_dir(
        app,
        &state,
        session_id,
        cmd,
        args,
        cols,
        rows,
        cwd.as_deref(),
    )
    .map(|_| ())
}

pub fn spawn_pty_process(
    app: tauri::AppHandle,
    state: &TerminalState,
    session_id: String,
    cmd: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
) -> Result<
    (
        Box<dyn Child + Send + Sync>,
        Arc<Mutex<Vec<u8>>>,
        Receiver<()>,
    ),
    String,
> {
    spawn_pty_process_in_dir(app, state, session_id, cmd, args, cols, rows, None)
}

fn resolve_terminal_cwd(cwd: Option<String>) -> Result<Option<PathBuf>, String> {
    let Some(cwd) = cwd.filter(|value| !value.trim().is_empty()) else {
        return Ok(None);
    };
    let path = PathBuf::from(cwd)
        .canonicalize()
        .map_err(|error| format!("终端工作目录不存在：{error}"))?;
    if !path.is_dir() {
        return Err("终端工作路径不是目录".to_string());
    }
    Ok(Some(path))
}

fn spawn_pty_process_in_dir(
    app: tauri::AppHandle,
    state: &TerminalState,
    session_id: String,
    cmd: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
    cwd: Option<&Path>,
) -> Result<
    (
        Box<dyn Child + Send + Sync>,
        Arc<Mutex<Vec<u8>>>,
        Receiver<()>,
    ),
    String,
> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cb = CommandBuilder::new(&cmd);
    for arg in &args {
        cb.arg(arg);
    }
    if let Some(cwd) = cwd {
        cb.cwd(cwd);
    }

    let child = pair.slave.spawn_command(cb).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let output = Arc::new(Mutex::new(Vec::new()));
    let (reader_done_tx, reader_done_rx) = mpsc::channel();

    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(
            session_id.clone(),
            PtySession {
                writer,
                master: SendableMaster(pair.master),
            },
        );
    }
    {
        let mut outputs = state.outputs.lock().unwrap();
        if outputs.len() >= MAX_OUTPUT_SNAPSHOTS {
            if let Some(oldest) = outputs.keys().next().cloned() {
                outputs.remove(&oldest);
            }
        }
        outputs.insert(session_id.clone(), output.clone());
    }

    let sid = session_id.clone();
    let captured = output.clone();
    let sessions = state.sessions.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = sessions.lock().map(|mut sessions| sessions.remove(&sid));
                    let _ = app.emit(&format!("terminal-exit-{}", sid), ());
                    break;
                }
                Ok(n) => {
                    let offset = if let Ok(mut output) = captured.lock() {
                        let offset = output.len();
                        output.extend_from_slice(&buf[..n]);
                        offset
                    } else {
                        0
                    };
                    let b64 = BASE64.encode(&buf[..n]);
                    let _ = app.emit(&format!("terminal-data-{}", sid), b64.clone());
                    let _ = app.emit(
                        &format!("terminal-data-v2-{}", sid),
                        TerminalDataChunk { offset, data: b64 },
                    );
                }
            }
        }
        let _ = reader_done_tx.send(());
    });

    Ok((child, output, reader_done_rx))
}

pub fn remove_pty_session(state: &TerminalState, session_id: &str) {
    let _ = state.sessions.lock().map(|mut sessions| {
        sessions.remove(session_id);
    });
}

#[tauri::command]
pub fn terminal_snapshot(
    session_id: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<TerminalSnapshot, String> {
    let output = state
        .outputs
        .lock()
        .map_err(|_| "terminal output lock poisoned".to_string())?
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "terminal session output not found".to_string())?;
    let bytes = output
        .lock()
        .map_err(|_| "terminal session output lock poisoned".to_string())?;
    let active = state
        .sessions
        .lock()
        .map_err(|_| "terminal session lock poisoned".to_string())?
        .contains_key(&session_id);
    Ok(TerminalSnapshot {
        data: BASE64.encode(bytes.as_slice()),
        offset: bytes.len(),
        active,
    })
}

/// Send raw bytes (base64-encoded) to the PTY's stdin.
#[tauri::command]
pub fn terminal_write(
    session_id: String,
    data: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let bytes = BASE64.decode(&data).map_err(|e| e.to_string())?;
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get_mut(&session_id) {
        s.writer.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Notify the PTY of a terminal resize.
#[tauri::command]
pub fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(s) = sessions.get(&session_id) {
        s.master
            .0
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Kill a PTY session and release its resources.
#[tauri::command]
pub fn terminal_kill(
    session_id: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    state.sessions.lock().unwrap().remove(&session_id);
    Ok(())
}

/// Stage a command and show the terminal window; the frontend polls once on mount.
#[tauri::command]
pub fn terminal_run(
    app: tauri::AppHandle,
    cmd: String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    *state.pending_cmd.lock().unwrap() = Some(cmd);
    if let Some(win) = app.get_webview_window("terminal") {
        if !win.is_visible().unwrap_or(false) {
            apply_pin_state(&app, "terminal");
            win.show().map_err(|e| e.to_string())?;
        }
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Take (and clear) any pending command staged by `terminal_run`.
#[tauri::command]
pub fn terminal_take_pending_cmd(state: tauri::State<'_, TerminalState>) -> Option<String> {
    state.pending_cmd.lock().unwrap().take()
}

/// Toggle terminal window visibility.
#[tauri::command]
pub fn toggle_terminal_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("terminal") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            apply_pin_state(&app, "terminal");
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
