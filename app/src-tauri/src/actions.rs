use tauri::Manager;

use crate::builtins::terminal::TerminalState;

pub fn split_command_args(input: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for ch in input.chars() {
        if let Some(q) = quote {
            if ch == q {
                quote = None;
            } else {
                current.push(ch);
            }
            continue;
        }
        match ch {
            '"' | '\'' => quote = Some(ch),
            c if c.is_whitespace() => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

fn spawn_first(candidates: &[String], args: &[String]) -> Result<(), String> {
    let mut last_err = None;
    for candidate in candidates {
        match std::process::Command::new(candidate).args(args).spawn() {
            Ok(_) => return Ok(()),
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    Err(last_err.unwrap_or_else(|| "no opener candidates".to_string()))
}

fn folder_opener_candidates(open_with: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    match open_with {
        "vscode" => {
            candidates.push("code".to_string());
            candidates.push("code.cmd".to_string());
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                candidates.push(format!(r"{}\Programs\Microsoft VS Code\Code.exe", local));
            }
            if let Ok(program_files) = std::env::var("ProgramFiles") {
                candidates.push(format!(r"{}\Microsoft VS Code\Code.exe", program_files));
            }
        }
        "cursor" => {
            candidates.push("cursor".to_string());
            candidates.push("cursor.cmd".to_string());
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                candidates.push(format!(r"{}\Programs\Cursor\Cursor.exe", local));
            }
            if let Ok(program_files) = std::env::var("ProgramFiles") {
                candidates.push(format!(r"{}\Cursor\Cursor.exe", program_files));
            }
        }
        _ => {
            #[cfg(target_os = "windows")]
            candidates.push("explorer.exe".to_string());
        }
    }
    candidates
}

fn open_folder_with(action: &serde_json::Value, target: &str) -> Result<(), String> {
    let open_with = action["openWith"]
        .as_str()
        .or_else(|| action["open_with"].as_str())
        .unwrap_or("explorer");

    if open_with == "custom" {
        let opener = action["customOpener"]
            .as_str()
            .or_else(|| action["custom_opener"].as_str())
            .ok_or("missing custom opener")?;
        let template = action["customOpenerArgs"]
            .as_str()
            .or_else(|| action["custom_opener_args"].as_str())
            .unwrap_or("{path}");
        let args = if template.trim().is_empty() || template.trim() == "{path}" {
            vec![target.to_string()]
        } else {
            split_command_args(&template.replace("{path}", target))
        };
        return std::process::Command::new(opener)
            .args(args)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string());
    }

    let candidates = folder_opener_candidates(open_with);
    if !candidates.is_empty() {
        return spawn_first(&candidates, &[target.to_string()]);
    }

    open::that(target).map_err(|e| e.to_string())
}

fn chrome_candidates() -> Vec<String> {
    let mut candidates = vec!["chrome.exe".to_string(), "chrome".to_string()];
    if let Ok(program_files) = std::env::var("ProgramFiles") {
        candidates.push(format!(
            r"{}\Google\Chrome\Application\chrome.exe",
            program_files
        ));
    }
    if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
        candidates.push(format!(
            r"{}\Google\Chrome\Application\chrome.exe",
            program_files_x86
        ));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        candidates.push(format!(r"{}\Google\Chrome\Application\chrome.exe", local));
    }
    candidates
}

fn normalize_url_target(target: &str) -> Result<String, String> {
    let value = target.trim();
    if value.is_empty() {
        return Err("missing target".to_string());
    }
    if value.contains("://") {
        return Ok(value.to_string());
    }
    Ok(format!("https://{}", value))
}

fn open_url_action(action: &serde_json::Value, target: &str) -> Result<(), String> {
    let url = normalize_url_target(target)?;
    let use_chrome = action["autofill"].as_bool().unwrap_or(false);
    if use_chrome {
        if spawn_first(&chrome_candidates(), std::slice::from_ref(&url)).is_ok() {
            return Ok(());
        }
    }
    open::that(url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_ssh_password(key: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new("DevLauncher", &key).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_ssh_password(key: String) -> Result<(), String> {
    match keyring::Entry::new("DevLauncher", &key) {
        Ok(entry) => {
            let _ = entry.delete_credential();
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

fn is_allowed_web_origin(origin: &str) -> bool {
    let origin = origin.trim().to_ascii_lowercase();
    origin.starts_with("https://")
        || origin == "http://localhost"
        || origin.starts_with("http://localhost:")
        || origin == "http://127.0.0.1"
        || origin.starts_with("http://127.0.0.1:")
        || origin == "http://[::1]"
        || origin.starts_with("http://[::1]:")
}

pub fn web_password_key(origin: &str, username: &str) -> Result<String, String> {
    let origin = origin.trim().trim_end_matches('/');
    let username = username.trim();
    if origin.is_empty() {
        return Err("missing web origin".to_string());
    }
    if username.is_empty() {
        return Err("missing web username".to_string());
    }
    if !is_allowed_web_origin(origin) {
        return Err("web passwords require HTTPS, except localhost".to_string());
    }
    Ok(format!("web:{}:{}", origin, username))
}

#[tauri::command]
pub fn save_web_password(origin: String, username: String, password: String) -> Result<(), String> {
    let key = web_password_key(&origin, &username)?;
    let entry = keyring::Entry::new("DevLauncher", &key).map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_web_password(origin: String, username: String) -> Result<(), String> {
    let key = web_password_key(&origin, &username)?;
    match keyring::Entry::new("DevLauncher", &key) {
        Ok(entry) => {
            let _ = entry.delete_credential();
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn execute_action(
    app: tauri::AppHandle,
    action: serde_json::Value,
    term_state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let action_type = action["type"].as_str().unwrap_or("");
    match action_type {
        "app" => {
            let target = action["target"].as_str().ok_or("missing target")?;
            let args: Vec<String> = action["args"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            std::process::Command::new(target)
                .args(&args)
                .spawn()
                .map_err(|e| format!("启动失败: {}", e))?;
        }
        "folder" => {
            let target = action["target"].as_str().ok_or("missing target")?;
            open_folder_with(&action, target)?;
        }
        "file" => {
            let target = action["target"].as_str().ok_or("missing target")?;
            open::that(target).map_err(|e| e.to_string())?;
        }
        "url" => {
            let target = action["target"].as_str().ok_or("missing target")?;
            open_url_action(&action, target)?;
        }
        "ssh" => {
            let host = action["host"].as_str().ok_or("missing host")?;
            let user = action["user"].as_str().ok_or("missing user")?;
            let port = action["port"].as_u64().unwrap_or(22);
            let terminal_pref = action["terminal"].as_str().unwrap_or("auto");
            let ssh_target = format!("{}@{}", user, host);
            let port_str = port.to_string();
            let cred_key = format!("ssh:{}@{}:{}", user, host, port);

            let password: Option<String> = keyring::Entry::new("DevLauncher", &cred_key)
                .ok()
                .and_then(|e| e.get_password().ok());

            let launch_gitbash_expect = |pwd: &str| -> bool {
                let gitbash_candidates = [
                    r"C:\Program Files\Git\git-bash.exe",
                    r"C:\Program Files (x86)\Git\git-bash.exe",
                ];
                let gitbash = gitbash_candidates
                    .iter()
                    .find(|p| std::path::Path::new(p).exists());
                let Some(&gitbash_exe) = gitbash else {
                    return false;
                };

                let safe_pwd = pwd
                    .replace('\\', "\\\\")
                    .replace('"', "\\\"")
                    .replace('$', "\\$")
                    .replace('`', "\\`");
                let port_opt = if port == 22 {
                    String::new()
                } else {
                    format!("-p {} ", port)
                };

                let script_path =
                    std::env::temp_dir().join(format!("dl_ssh_{}.exp", std::process::id()));
                let win = script_path.to_string_lossy().to_string();
                let msys_path = if win.len() >= 2 && win.as_bytes()[1] == b':' {
                    let drive = win.chars().next().unwrap().to_ascii_lowercase();
                    let rest = win[2..].replace('\\', "/");
                    format!("/{}{}", drive, rest)
                } else {
                    win.replace('\\', "/")
                };

                let expect_script = format!(
                    "#!/usr/bin/expect -f\nlog_user 1\nspawn ssh {port_opt}{ssh_target}\n\
                     expect {{\n  \"yes/no\" {{ send \"yes\\r\"; exp_continue }}\n\
                     \"password:*\" {{ send \"{safe_pwd}\\r\"; interact }}\n\
                     timeout {{ interact }}\n}}\n"
                );
                if std::fs::write(&script_path, expect_script.as_bytes()).is_err() {
                    return false;
                }

                let bash_cmd = format!("expect '{}'; exec bash", msys_path);
                std::process::Command::new(gitbash_exe)
                    .args(["-c", &bash_cmd])
                    .spawn()
                    .is_ok()
            };

            let launch_plink = |pwd: &str| -> bool {
                let plink_candidates = [
                    "plink",
                    r"C:\Program Files\PuTTY\plink.exe",
                    r"C:\Program Files (x86)\PuTTY\plink.exe",
                ];
                let plink = plink_candidates.iter().find(|&&p| {
                    std::process::Command::new(p)
                        .arg("-V")
                        .output()
                        .map(|o| !o.stdout.is_empty() || !o.stderr.is_empty())
                        .unwrap_or(false)
                });
                let Some(&plink_exe) = plink else {
                    return false;
                };

                let plink_args_wt: Vec<&str> = vec![
                    "--",
                    plink_exe,
                    "-ssh",
                    "-pw",
                    pwd,
                    "-P",
                    &port_str,
                    &ssh_target,
                ];
                let cmd_line = format!(
                    "{} -ssh -pw {} -P {} {}",
                    plink_exe, pwd, port_str, ssh_target
                );
                if std::process::Command::new("wt.exe")
                    .args(&plink_args_wt)
                    .spawn()
                    .is_ok()
                {
                    return true;
                }
                std::process::Command::new("cmd")
                    .args(["/C", "start", "cmd", "/K", &cmd_line])
                    .spawn()
                    .is_ok()
            };

            let launch_plain = || -> Result<(), String> {
                let ssh_args_base: Vec<String> = if port == 22 {
                    vec![ssh_target.clone()]
                } else {
                    vec!["-p".to_string(), port_str.clone(), ssh_target.clone()]
                };
                let ssh_args: Vec<&str> = ssh_args_base.iter().map(|s| s.as_str()).collect();

                match terminal_pref {
                    "wt" => {
                        let mut a = vec!["ssh"];
                        a.extend(&ssh_args);
                        std::process::Command::new("wt.exe")
                            .args(&a)
                            .spawn()
                            .map_err(|e| e.to_string())?;
                    }
                    "cmd" => {
                        let mut a = vec!["/C", "start", "cmd", "/K", "ssh"];
                        a.extend(&ssh_args);
                        std::process::Command::new("cmd")
                            .args(&a)
                            .spawn()
                            .map_err(|e| e.to_string())?;
                    }
                    "powershell" => {
                        let ssh_cmd = format!("ssh {}", ssh_args.join(" "));
                        std::process::Command::new("powershell")
                            .args(["-NoExit", "-Command", &ssh_cmd])
                            .spawn()
                            .map_err(|e| e.to_string())?;
                    }
                    "gitbash" => {
                        let gitbash_candidates = [
                            r"C:\Program Files\Git\git-bash.exe",
                            r"C:\Program Files (x86)\Git\git-bash.exe",
                        ];
                        let gitbash = gitbash_candidates
                            .iter()
                            .find(|p| std::path::Path::new(p).exists())
                            .ok_or("Git Bash 未找到 (需安装 Git for Windows)")?;
                        let ssh_cmd = format!("ssh {}; exec bash", ssh_args.join(" "));
                        std::process::Command::new(gitbash)
                            .args(["-c", &ssh_cmd])
                            .spawn()
                            .map_err(|e| e.to_string())?;
                    }
                    _ => {
                        let mut a = vec!["ssh"];
                        a.extend(&ssh_args);
                        if std::process::Command::new("wt.exe")
                            .args(&a)
                            .spawn()
                            .is_err()
                        {
                            let mut ca = vec!["/C", "start", "cmd", "/K", "ssh"];
                            ca.extend(&ssh_args);
                            std::process::Command::new("cmd")
                                .args(&ca)
                                .spawn()
                                .map_err(|e| e.to_string())?;
                        }
                    }
                }
                Ok(())
            };

            if terminal_pref == "terminal" {
                let port_flag = if port == 22 {
                    String::new()
                } else {
                    format!("-p {} ", port)
                };
                let ssh_cmd = format!("ssh {}{}", port_flag, ssh_target);
                *term_state.pending_cmd.lock().unwrap() = Some(ssh_cmd);
                if let Some(win) = app.get_webview_window("terminal") {
                    if !win.is_visible().unwrap_or(false) {
                        win.show().map_err(|e| e.to_string())?;
                    }
                    win.set_focus().map_err(|e| e.to_string())?;
                }
                return Ok(());
            }

            if let Some(ref pwd) = password {
                let launched = match terminal_pref {
                    "gitbash" => launch_gitbash_expect(pwd),
                    _ => {
                        if launch_plink(pwd) {
                            true
                        } else {
                            launch_gitbash_expect(pwd)
                        }
                    }
                };
                if !launched {
                    launch_plain()?;
                }
            } else {
                launch_plain()?;
            }
        }
        "script" => {
            let shell = action["shell"].as_str().unwrap_or("powershell");
            let content = action["content"].as_str().unwrap_or("");
            if shell == "terminal" {
                *term_state.pending_cmd.lock().unwrap() = Some(content.to_string());
                if let Some(win) = app.get_webview_window("terminal") {
                    if !win.is_visible().unwrap_or(false) {
                        win.show().map_err(|e| e.to_string())?;
                    }
                    win.set_focus().map_err(|e| e.to_string())?;
                }
                return Ok(());
            }
            match shell {
                "powershell" => {
                    std::process::Command::new("powershell")
                        .args(["-NoExit", "-Command", content])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "cmd" | "bat" => {
                    std::process::Command::new("cmd")
                        .args(["/K", content])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "wsl" => {
                    let distro = action["distro"].as_str().unwrap_or("Ubuntu");
                    if content.is_empty() {
                        if std::process::Command::new("wt.exe")
                            .args(["new-tab", "wsl.exe", "-d", distro])
                            .spawn()
                            .is_err()
                        {
                            std::process::Command::new("cmd")
                                .args(["/C", "start", "", "wsl.exe", "-d", distro])
                                .spawn()
                                .map_err(|e| e.to_string())?;
                        }
                    } else if content.trim().ends_with(".sh") {
                        let script_path = content.trim();
                        let inner =
                            format!("bash -l '{}'; exec bash", script_path.replace("'", "'\\''"));
                        let wt_inner = inner.replace(";", "\\;");
                        if std::process::Command::new("wt.exe")
                            .args([
                                "new-tab", "wsl.exe", "-d", distro, "-e", "bash", "-l", "-c",
                                &wt_inner,
                            ])
                            .spawn()
                            .is_err()
                        {
                            std::process::Command::new("cmd")
                                .args([
                                    "/C", "start", "", "wsl.exe", "-d", distro, "-e", "bash", "-l",
                                    "-c", &inner,
                                ])
                                .spawn()
                                .map_err(|e| e.to_string())?;
                        }
                    } else {
                        let inner = format!("{}; exec bash", content);
                        let wt_inner = inner.replace(";", "\\;");
                        if std::process::Command::new("wt.exe")
                            .args([
                                "new-tab", "wsl.exe", "-d", distro, "-e", "bash", "-l", "-c",
                                &wt_inner,
                            ])
                            .spawn()
                            .is_err()
                        {
                            std::process::Command::new("cmd")
                                .args([
                                    "/C", "start", "", "wsl.exe", "-d", distro, "-e", "bash", "-l",
                                    "-c", &inner,
                                ])
                                .spawn()
                                .map_err(|e| e.to_string())?;
                        }
                    }
                }
                _ => {}
            }
        }
        "system" => {
            let cmd = action["command"].as_str().unwrap_or("");
            match cmd {
                "lock" => {
                    std::process::Command::new("rundll32.exe")
                        .args(["user32.dll,LockWorkStation"])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "sleep" => {
                    std::process::Command::new("powershell")
                        .args(["-Command", "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "calculator" => {
                    std::process::Command::new("calc.exe")
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "notepad" => {
                    std::process::Command::new("notepad.exe")
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "explorer" => {
                    std::process::Command::new("explorer.exe")
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "taskmanager" => {
                    std::process::Command::new("taskmgr.exe")
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "shutdown" => {
                    std::process::Command::new("shutdown")
                        .args(["/s", "/t", "0"])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                "restart" => {
                    std::process::Command::new("shutdown")
                        .args(["/r", "/t", "0"])
                        .spawn()
                        .map_err(|e| e.to_string())?;
                }
                _ => {}
            }
        }
        _ => {}
    }
    Ok(())
}
