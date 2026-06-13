use futures_util::{SinkExt, StreamExt};
use image::{imageops, DynamicImage, RgbaImage};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Manager;

// -----------------------------------------------
// Data Structures
// -----------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteDeskProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_password: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
pub struct HostInfo {
    pub pin: String,
    pub local_ip: String,
    pub port: u16,
}

#[derive(Debug, Serialize, Clone)]
pub struct HostStatus {
    pub running: bool,
    pub connections: u32,
    pub pin: Option<String>,
}

pub(crate) struct RemoteDeskHostState {
    pub stop_tx: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
    pub pin: Arc<Mutex<Option<String>>>,
    pub connections: Arc<AtomicU32>,
}

pub(crate) struct FrpState {
    pub child: Arc<Mutex<Option<std::process::Child>>>,
}

#[derive(Debug, Serialize)]
pub struct FrpStatus {
    pub running: bool,
}

pub(crate) struct NgrokState {
    pub child: Arc<Mutex<Option<std::process::Child>>>,
    pub public_addr: Arc<Mutex<Option<String>>>,
    pub error: Arc<Mutex<Option<String>>>,
}

#[derive(Debug, Serialize)]
pub struct NgrokStatus {
    pub running: bool,
    pub public_addr: Option<String>,
    pub error: Option<String>,
}

// -----------------------------------------------
// Setup
// -----------------------------------------------

pub fn setup(app: &mut tauri::App) {
    app.manage(RemoteDeskHostState {
        stop_tx: Arc::new(Mutex::new(None)),
        pin: Arc::new(Mutex::new(None)),
        connections: Arc::new(AtomicU32::new(0)),
    });
    app.manage(FrpState {
        child: Arc::new(Mutex::new(None)),
    });
    app.manage(NgrokState {
        child: Arc::new(Mutex::new(None)),
        public_addr: Arc::new(Mutex::new(None)),
        error: Arc::new(Mutex::new(None)),
    });
}

// -----------------------------------------------
// Helpers
// -----------------------------------------------

fn remotedesk_profiles_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("remotedesk_profiles.json")
}

fn local_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                return addr.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

fn move_remote_mouse(enigo: &mut enigo::Enigo, x: i32, y: i32) {
    #[cfg(windows)]
    {
        let ok = unsafe { windows_sys::Win32::UI::WindowsAndMessaging::SetCursorPos(x, y) };
        if ok != 0 {
            return;
        }
        eprintln!("[remotedesk] SetCursorPos failed, falling back to enigo");
    }

    use enigo::Mouse;
    let _ = enigo.move_mouse(x, y, enigo::Coordinate::Abs);
}

// -----------------------------------------------
// Remote Desktop Commands
// -----------------------------------------------

#[tauri::command]
pub fn toggle_remotedesk_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("remotedesk") {
        if win.is_visible().unwrap_or(false) {
            win.hide().map_err(|e| e.to_string())?;
        } else {
            win.show().map_err(|e| e.to_string())?;
            win.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn load_remotedesk_profiles(app: tauri::AppHandle) -> Result<Vec<RemoteDeskProfile>, String> {
    let path = remotedesk_profiles_path(&app);
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_remotedesk_profiles(
    app: tauri::AppHandle,
    profiles: Vec<RemoteDeskProfile>,
) -> Result<(), String> {
    let path = remotedesk_profiles_path(&app);
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    let data = serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_remotedesk_password(id: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new("devlauncher-remotedesk", &id).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_remotedesk_password(id: String) -> Result<(), String> {
    let entry = keyring::Entry::new("devlauncher-remotedesk", &id).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential();
    Ok(())
}

#[tauri::command]
pub fn launch_rdp(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let profiles = load_remotedesk_profiles(app.clone())?;
    let profile = profiles
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Profile '{}' not found", id))?
        .clone();

    let host_port = format!("{}:{}", profile.host, profile.port);

    if profile.has_password.unwrap_or(false) {
        let entry =
            keyring::Entry::new("devlauncher-remotedesk", &id).map_err(|e| e.to_string())?;
        if let Ok(password) = entry.get_password() {
            let _ = std::process::Command::new("cmdkey")
                .args([
                    &format!("/add:{}", host_port),
                    &format!("/user:{}", profile.username),
                    &format!("/pass:{}", password),
                ])
                .output();
        }
    }

    std::process::Command::new("mstsc")
        .arg(format!("/v:{}", host_port))
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn start_remotedesk_host(
    app: tauri::AppHandle,
    port: Option<u16>,
) -> Result<HostInfo, String> {
    let state = app.state::<RemoteDeskHostState>();

    {
        let mut tx_guard = state.stop_tx.lock().unwrap();
        if let Some(tx) = tx_guard.take() {
            let _ = tx.send(());
        }
    }

    let ws_port = port.unwrap_or(19090);
    let pin: String = {
        let mut rng = rand::thread_rng();
        format!("{:06}", rng.gen_range(0..1_000_000))
    };
    let local = local_ip();

    *state.pin.lock().unwrap() = Some(pin.clone());
    state.connections.store(0, Ordering::Relaxed);

    let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();
    *state.stop_tx.lock().unwrap() = Some(stop_tx);

    let pin_clone = pin.clone();
    let conn_count = Arc::clone(&state.connections);

    let (screen_x, screen_y, screen_w, screen_h) = {
        use screenshots::Screen;
        Screen::all()
            .ok()
            .and_then(|all| {
                let idx = all
                    .iter()
                    .position(|s| s.display_info.is_primary)
                    .unwrap_or(0);
                all.into_iter().nth(idx).map(|s| {
                    (
                        s.display_info.x,
                        s.display_info.y,
                        s.display_info.width,
                        s.display_info.height,
                    )
                })
            })
            .unwrap_or((0, 0, 1920, 1080))
    };

    tokio::spawn(async move {
        use tokio::net::TcpListener;
        use tokio_tungstenite::tungstenite::protocol::Message;

        let addr = format!("0.0.0.0:{}", ws_port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[remotedesk] bind failed: {}", e);
                return;
            }
        };

        let (frame_tx, _) = tokio::sync::broadcast::channel::<Vec<u8>>(4);
        let frame_tx = Arc::new(frame_tx);
        let capture_running = Arc::new(AtomicBool::new(true));

        let (input_tx, input_rx) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            use enigo::{Button, Enigo, Mouse, Settings};
            let mut enigo = match Enigo::new(&Settings::default()) {
                Ok(e) => e,
                Err(e) => {
                    eprintln!("[remotedesk] enigo init failed: {}", e);
                    return;
                }
            };
            let max_rel_x = screen_w.saturating_sub(1) as i32;
            let max_rel_y = screen_h.saturating_sub(1) as i32;
            let mut debug_count = 0u32;
            for msg in input_rx {
                let v: serde_json::Value = match serde_json::from_str(&msg) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let kind = v["type"].as_str().unwrap_or("");
                let rel_x = (v["x"].as_i64().unwrap_or(0) as i32).clamp(0, max_rel_x);
                let rel_y = (v["y"].as_i64().unwrap_or(0) as i32).clamp(0, max_rel_y);
                let x = screen_x + rel_x;
                let y = screen_y + rel_y;
                let btn_idx = v["button"].as_i64().unwrap_or(0);
                let button = match btn_idx {
                    2 => Button::Right,
                    1 => Button::Middle,
                    _ => Button::Left,
                };
                if debug_count < 20 || kind != "mousemove" {
                    eprintln!(
                        "[remotedesk input] kind={} rel=({}, {}) abs=({}, {}) screen_origin=({}, {}) button={}",
                        kind, rel_x, rel_y, x, y, screen_x, screen_y, btn_idx,
                    );
                    debug_count += 1;
                }
                match kind {
                    "mousemove" => {
                        move_remote_mouse(&mut enigo, x, y);
                    }
                    "mousedown" => {
                        move_remote_mouse(&mut enigo, x, y);
                        let _ = enigo.button(button, enigo::Direction::Press);
                    }
                    "mouseup" => {
                        move_remote_mouse(&mut enigo, x, y);
                        let _ = enigo.button(button, enigo::Direction::Release);
                    }
                    _ => {}
                }
            }
        });
        let input_tx = Arc::new(input_tx);

        {
            let frame_tx = Arc::clone(&frame_tx);
            let capture_running = Arc::clone(&capture_running);
            std::thread::spawn(move || {
                use screenshots::Screen;

                let screen = {
                    let all = match Screen::all() {
                        Ok(s) => s,
                        Err(e) => {
                            eprintln!("[remotedesk] screen list error: {}", e);
                            return;
                        }
                    };
                    if all.is_empty() {
                        eprintln!("[remotedesk] no screens found");
                        return;
                    }
                    let idx = all
                        .iter()
                        .position(|s| s.display_info.is_primary)
                        .unwrap_or(0);
                    all.into_iter().nth(idx).unwrap()
                };

                let interval = std::time::Duration::from_millis(50);
                while capture_running.load(Ordering::Relaxed) {
                    std::thread::sleep(interval);
                    if frame_tx.receiver_count() == 0 {
                        continue;
                    }
                    let captured = match screen.capture() {
                        Ok(img) => img,
                        Err(e) => {
                            eprintln!("[remotedesk] frame error: {}", e);
                            break;
                        }
                    };
                    let w = captured.width();
                    let h = captured.height();
                    let raw: Vec<u8> = captured.into_raw();
                    let dyn_img = match RgbaImage::from_raw(w, h, raw) {
                        Some(img) => DynamicImage::ImageRgba8(img),
                        None => continue,
                    };
                    let scaled = if w > 1920 {
                        dyn_img.resize(
                            1920,
                            (h as f32 * 1920.0 / w as f32) as u32,
                            imageops::FilterType::Triangle,
                        )
                    } else {
                        dyn_img
                    };
                    let mut buf = std::io::Cursor::new(Vec::new());
                    {
                        use image::codecs::jpeg::JpegEncoder;
                        let mut enc = JpegEncoder::new_with_quality(&mut buf, 70);
                        if enc.encode_image(&scaled).is_err() {
                            continue;
                        }
                    }
                    let _ = frame_tx.send(buf.into_inner());
                }
            });
        }

        let mut stop_rx = stop_rx;
        loop {
            tokio::select! {
                _ = &mut stop_rx => break,
                result = listener.accept() => {
                    match result {
                        Ok((stream, _)) => {
                            let pin_expected = pin_clone.clone();
                            let mut rx = frame_tx.subscribe();
                            let conn_count = Arc::clone(&conn_count);
                            let input_tx = Arc::clone(&input_tx);
                            tokio::spawn(async move {
                                let ws_stream = match tokio_tungstenite::accept_async(stream).await {
                                    Ok(ws) => ws,
                                    Err(_) => return,
                                };
                                let (mut sender, mut receiver) = ws_stream.split();

                                let auth = tokio::time::timeout(
                                    std::time::Duration::from_secs(10),
                                    receiver.next()
                                ).await;
                                let authed = match auth {
                                    Ok(Some(Ok(Message::Text(txt)))) => {
                                        let v: serde_json::Value = serde_json::from_str(&txt).unwrap_or_default();
                                        v["pin"].as_str().unwrap_or("") == pin_expected
                                    }
                                    _ => false,
                                };
                                if !authed {
                                    let _ = sender.send(Message::Text("{\"error\":\"invalid_pin\"}".to_string().into())).await;
                                    return;
                                }
                                let ok_msg = format!("{{\"ok\":true,\"screen_x\":{},\"screen_y\":{},\"screen_w\":{},\"screen_h\":{}}}", screen_x, screen_y, screen_w, screen_h);
                                let _ = sender.send(Message::Text(ok_msg.into())).await;
                                conn_count.fetch_add(1, Ordering::Relaxed);

                                let mut input_task = {
                                    let input_tx = Arc::clone(&input_tx);
                                    tokio::spawn(async move {
                                        while let Some(msg) = receiver.next().await {
                                            match msg {
                                                Ok(Message::Text(txt)) => {
                                                    let _ = input_tx.send(txt.to_string());
                                                }
                                                Ok(Message::Close(_)) | Err(_) => break,
                                                _ => {}
                                            }
                                        }
                                    })
                                };

                                loop {
                                    tokio::select! {
                                        _ = &mut input_task => break,
                                        frame_result = rx.recv() => {
                                            match frame_result {
                                                Ok(jpeg_bytes) => {
                                                    let sent = tokio::time::timeout(
                                                        std::time::Duration::from_millis(1500),
                                                        sender.send(Message::Binary(jpeg_bytes.into())),
                                                    ).await;
                                                    if !matches!(sent, Ok(Ok(_))) {
                                                        break;
                                                    }
                                                }
                                                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                                                Err(_) => break,
                                            }
                                        }
                                    }
                                }
                                input_task.abort();
                                conn_count.fetch_sub(1, Ordering::Relaxed);
                            });
                        }
                        Err(e) => eprintln!("[remotedesk] accept error: {}", e),
                    }
                }
            }
        }
        capture_running.store(false, Ordering::Relaxed);
    });

    Ok(HostInfo {
        pin,
        local_ip: local,
        port: ws_port,
    })
}

#[tauri::command]
pub fn stop_remotedesk_host(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<RemoteDeskHostState>();
    if let Some(tx) = state.stop_tx.lock().unwrap().take() {
        let _ = tx.send(());
    }
    *state.pin.lock().unwrap() = None;
    state.connections.store(0, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn get_remotedesk_host_status(app: tauri::AppHandle) -> HostStatus {
    let state = app.state::<RemoteDeskHostState>();
    let pin = state.pin.lock().unwrap().clone();
    let running = pin.is_some();
    let connections = state.connections.load(Ordering::Relaxed);
    HostStatus {
        running,
        connections,
        pin,
    }
}

// -----------------------------------------------
// frp Commands
// -----------------------------------------------

#[tauri::command]
pub fn start_frp(
    app: tauri::AppHandle,
    frpc_path: String,
    vps_ip: String,
    vps_server_port: u16,
    remote_port: u16,
    local_port: u16,
) -> Result<(), String> {
    {
        let state = app.state::<FrpState>();
        let mut guard = state.child.lock().unwrap();
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
    }

    let config = format!(
        "[common]\nserver_addr = {}\nserver_port = {}\n\n[remotedesk-ws]\ntype = tcp\nlocal_ip = 127.0.0.1\nlocal_port = {}\nremote_port = {}\n",
        vps_ip, vps_server_port, local_port, remote_port
    );

    let config_path = std::env::temp_dir().join("devlauncher_frpc.ini");
    fs::write(&config_path, config).map_err(|e| format!("写入 frpc.ini 失败: {}", e))?;

    let child = std::process::Command::new(&frpc_path)
        .args(["-c", config_path.to_str().unwrap_or("")])
        .spawn()
        .map_err(|e| format!("frpc 启动失败: {} (路径: {})", e, frpc_path))?;

    *app.state::<FrpState>().child.lock().unwrap() = Some(child);
    Ok(())
}

#[tauri::command]
pub fn stop_frp(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<FrpState>();
    let mut guard = state.child.lock().unwrap();
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_frp_status(app: tauri::AppHandle) -> FrpStatus {
    let state = app.state::<FrpState>();
    let mut guard = state.child.lock().unwrap();
    let running = if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(None) => true,
            _ => {
                *guard = None;
                false
            }
        }
    } else {
        false
    };
    FrpStatus { running }
}

// -----------------------------------------------
// ngrok Commands
// -----------------------------------------------

#[tauri::command]
pub fn start_ngrok(app: tauri::AppHandle, local_port: u16) -> Result<(), String> {
    let state = app.state::<NgrokState>();
    {
        let mut guard = state.child.lock().unwrap();
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
        }
        *state.public_addr.lock().unwrap() = None;
        *state.error.lock().unwrap() = None;
    }

    let ngrok_candidates = [
        "ngrok",
        r"C:\ngrok\ngrok.exe",
        r"C:\tools\ngrok.exe",
        r"C:\Users\Public\ngrok.exe",
    ];
    let ngrok_exe = ngrok_candidates
        .iter()
        .find(|&&p| {
            std::process::Command::new(p)
                .arg("version")
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        })
        .copied()
        .ok_or("ngrok 未找到，请先下载 ngrok.exe 并加入 PATH 或放到 C:\\ngrok\\ 目录")?;

    let child = std::process::Command::new(ngrok_exe)
        .args(["http", &local_port.to_string()])
        .env_remove("http_proxy")
        .env_remove("https_proxy")
        .env_remove("HTTP_PROXY")
        .env_remove("HTTPS_PROXY")
        .env_remove("ALL_PROXY")
        .env_remove("all_proxy")
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("ngrok 启动失败: {}", e))?;

    *state.child.lock().unwrap() = Some(child);

    let public_addr_arc = Arc::clone(&state.public_addr);
    let child_arc = Arc::clone(&state.child);
    let error_arc = Arc::clone(&state.error);

    std::thread::spawn(move || {
        for attempt in 0..40 {
            std::thread::sleep(std::time::Duration::from_millis(500));

            {
                let mut guard = child_arc.lock().unwrap();
                if let Some(child) = guard.as_mut() {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            let mut msg = format!("ngrok 已退出 (code {})", status);
                            if let Some(mut stderr) = child.stderr.take() {
                                use std::io::Read;
                                let mut buf = String::new();
                                let _ = stderr.read_to_string(&mut buf);
                                if buf.contains("ERR_NGROK_4018")
                                    || buf.contains("ERR_NGROK_105")
                                    || (buf.contains("authtoken")
                                        && (buf.contains("ERR_")
                                            || buf.contains("invalid")
                                            || buf.contains("missing")
                                            || buf.contains("not set")))
                                {
                                    msg = "未配置 authtoken，请运行: ngrok config add-authtoken <token>".into();
                                } else if buf.contains("ERR_NGROK_9009") {
                                    msg =
                                        "代理冲突 (ERR_NGROK_9009)：已自动清除代理变量，请重试一次"
                                            .into();
                                } else if buf.contains("already")
                                    || buf.contains("address already in use")
                                {
                                    msg = "ngrok 已在运行，请先关闭其他 ngrok 实例".into();
                                } else {
                                    let first_msg = buf
                                        .lines()
                                        .map(|l| l.trim_start_matches("ERROR:").trim())
                                        .find(|l| l.len() > 4)
                                        .unwrap_or("");
                                    if !first_msg.is_empty() {
                                        msg = first_msg.to_string();
                                    }
                                }
                            }
                            *error_arc.lock().unwrap() = Some(msg);
                            *guard = None;
                            return;
                        }
                        _ => {}
                    }
                } else {
                    return;
                }
            }

            match ureq::get("http://127.0.0.1:4040/api/tunnels").call() {
                Ok(resp) => {
                    if let Ok(body) = resp.into_string() {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                            if let Some(tunnels) = json["tunnels"].as_array() {
                                for t in tunnels {
                                    if let Some(url) = t["public_url"].as_str() {
                                        *public_addr_arc.lock().unwrap() = Some(url.to_string());
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }
                Err(ureq::Error::Status(code, resp)) if code == 401 || code == 403 => {
                    let body = resp.into_string().unwrap_or_default();
                    let msg = serde_json::from_str::<serde_json::Value>(&body)
                        .ok()
                        .and_then(|v| v["msg"].as_str().map(|s| s.to_string()))
                        .unwrap_or_else(|| "认证失败，请配置 authtoken".into());
                    *error_arc.lock().unwrap() = Some(msg);
                    return;
                }
                _ => {}
            }

            if attempt == 39 {
                *error_arc.lock().unwrap() =
                    Some("超时：20s 内未获取到公网地址，请检查 authtoken 和网络连接".into());
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn stop_ngrok(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<NgrokState>();
    let mut guard = state.child.lock().unwrap();
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    *state.public_addr.lock().unwrap() = None;
    *state.error.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn get_ngrok_status(app: tauri::AppHandle) -> NgrokStatus {
    let state = app.state::<NgrokState>();
    let mut child_guard = state.child.lock().unwrap();
    let running = if let Some(child) = child_guard.as_mut() {
        match child.try_wait() {
            Ok(None) => true,
            _ => {
                *child_guard = None;
                false
            }
        }
    } else {
        false
    };
    if !running {
        *state.public_addr.lock().unwrap() = None;
    }
    let public_addr = state.public_addr.lock().unwrap().clone();
    let error = state.error.lock().unwrap().clone();
    NgrokStatus {
        running,
        public_addr,
        error,
    }
}
