use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
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
    /// Command staged by `terminal_run`; consumed once by `terminal_take_pending_cmd`.
    pub pending_cmd: Arc<Mutex<Option<String>>>,
}

pub fn setup(app: &mut tauri::App) {
    app.manage(TerminalState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
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
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    spawn_pty_process(app, &state, session_id, cmd, args, cols, rows).map(|_| ())
}

pub fn spawn_pty_process(
    app: tauri::AppHandle,
    state: &TerminalState,
    session_id: String,
    cmd: String,
    args: Vec<String>,
    cols: u16,
    rows: u16,
) -> Result<(Box<dyn Child + Send + Sync>, Arc<Mutex<Vec<u8>>>), String> {
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

    let child = pair.slave.spawn_command(cb).map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let output = Arc::new(Mutex::new(Vec::new()));

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

    let sid = session_id.clone();
    let captured = output.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app.emit(&format!("terminal-exit-{}", sid), ());
                    break;
                }
                Ok(n) => {
                    if let Ok(mut output) = captured.lock() {
                        output.extend_from_slice(&buf[..n]);
                    }
                    let b64 = BASE64.encode(&buf[..n]);
                    let _ = app.emit(&format!("terminal-data-{}", sid), b64);
                }
            }
        }
    });

    Ok((child, output))
}

pub fn remove_pty_session(state: &TerminalState, session_id: &str) {
    let _ = state.sessions.lock().map(|mut sessions| {
        sessions.remove(session_id);
    });
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
