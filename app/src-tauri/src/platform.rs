use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Windows,
    Macos,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandSpec {
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub platform: String,
    pub supports_windows_rdp: bool,
    pub supports_windows_ocr: bool,
    pub supports_wsl: bool,
    pub preferred_shortcut_modifier: String,
}

pub fn current_platform() -> Platform {
    if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "macos") {
        Platform::Macos
    } else {
        Platform::Other
    }
}

pub fn platform_name(platform: Platform) -> &'static str {
    match platform {
        Platform::Windows => "windows",
        Platform::Macos => "macos",
        Platform::Other => "other",
    }
}

pub fn capabilities_for(platform: Platform) -> PlatformCapabilities {
    PlatformCapabilities {
        platform: platform_name(platform).to_string(),
        supports_windows_rdp: platform == Platform::Windows,
        supports_windows_ocr: platform == Platform::Windows,
        supports_wsl: platform == Platform::Windows,
        preferred_shortcut_modifier: if platform == Platform::Macos {
            "Cmd+Opt".to_string()
        } else {
            "Ctrl+Alt".to_string()
        },
    }
}

pub fn default_shell_spec(platform: Platform) -> CommandSpec {
    match platform {
        Platform::Windows => CommandSpec {
            program: "powershell.exe".to_string(),
            args: vec![],
        },
        Platform::Macos | Platform::Other => {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            CommandSpec {
                program: shell,
                args: vec!["-l".to_string()],
            }
        }
    }
}

pub fn shell_run_spec(platform: Platform, command: &str) -> CommandSpec {
    match platform {
        Platform::Windows => CommandSpec {
            program: "powershell.exe".to_string(),
            args: vec!["-NoExit".to_string(), "-Command".to_string(), command.to_string()],
        },
        Platform::Macos | Platform::Other => {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            CommandSpec {
                program: shell.clone(),
                args: vec!["-lc".to_string(), format!("{}; exec {}", command, shell)],
            }
        }
    }
}

pub fn app_launch_spec(platform: Platform, target: &str, args: &[String]) -> CommandSpec {
    if platform == Platform::Macos && target.to_ascii_lowercase().ends_with(".app") {
        let mut open_args = vec![target.to_string()];
        if !args.is_empty() {
            open_args.push("--args".to_string());
            open_args.extend(args.iter().cloned());
        }
        return CommandSpec {
            program: "open".to_string(),
            args: open_args,
        };
    }

    CommandSpec {
        program: target.to_string(),
        args: args.to_vec(),
    }
}

pub fn folder_open_spec(
    platform: Platform,
    open_with: &str,
    target: &str,
) -> Result<CommandSpec, String> {
    match open_with {
        "vscode" => Ok(CommandSpec {
            program: "code".to_string(),
            args: vec![target.to_string()],
        }),
        "cursor" => Ok(CommandSpec {
            program: "cursor".to_string(),
            args: vec![target.to_string()],
        }),
        "explorer" => match platform {
            Platform::Windows => Ok(CommandSpec {
                program: "explorer.exe".to_string(),
                args: vec![target.to_string()],
            }),
            Platform::Macos => Ok(CommandSpec {
                program: "open".to_string(),
                args: vec![target.to_string()],
            }),
            Platform::Other => Ok(CommandSpec {
                program: "xdg-open".to_string(),
                args: vec![target.to_string()],
            }),
        },
        _ => Err(format!("unsupported folder opener: {open_with}")),
    }
}

pub fn chrome_candidates(platform: Platform) -> Vec<String> {
    match platform {
        Platform::Windows => {
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
        Platform::Macos => vec![
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".to_string(),
            "google-chrome".to_string(),
            "chrome".to_string(),
        ],
        Platform::Other => vec!["google-chrome".to_string(), "chromium".to_string()],
    }
}

pub fn system_command_spec(platform: Platform, command: &str) -> Result<CommandSpec, String> {
    match (platform, command) {
        (Platform::Windows, "lock") => Ok(CommandSpec {
            program: "rundll32.exe".to_string(),
            args: vec!["user32.dll,LockWorkStation".to_string()],
        }),
        (Platform::Windows, "sleep") => Ok(CommandSpec {
            program: "powershell".to_string(),
            args: vec![
                "-Command".to_string(),
                "Add-Type -Assembly System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)".to_string(),
            ],
        }),
        (Platform::Windows, "calculator") => Ok(CommandSpec {
            program: "calc.exe".to_string(),
            args: vec![],
        }),
        (Platform::Windows, "notepad") => Ok(CommandSpec {
            program: "notepad.exe".to_string(),
            args: vec![],
        }),
        (Platform::Windows, "explorer") => Ok(CommandSpec {
            program: "explorer.exe".to_string(),
            args: vec![],
        }),
        (Platform::Windows, "taskmanager") => Ok(CommandSpec {
            program: "taskmgr.exe".to_string(),
            args: vec![],
        }),
        (Platform::Windows, "shutdown") => Ok(CommandSpec {
            program: "shutdown".to_string(),
            args: vec!["/s".to_string(), "/t".to_string(), "0".to_string()],
        }),
        (Platform::Windows, "restart") => Ok(CommandSpec {
            program: "shutdown".to_string(),
            args: vec!["/r".to_string(), "/t".to_string(), "0".to_string()],
        }),
        (Platform::Macos, "lock") => Ok(CommandSpec {
            program: "pmset".to_string(),
            args: vec!["displaysleepnow".to_string()],
        }),
        (Platform::Macos, "sleep") => Ok(CommandSpec {
            program: "pmset".to_string(),
            args: vec!["sleepnow".to_string()],
        }),
        (Platform::Macos, "calculator") => Ok(CommandSpec {
            program: "open".to_string(),
            args: vec!["-a".to_string(), "Calculator".to_string()],
        }),
        (Platform::Macos, "notepad") => Ok(CommandSpec {
            program: "open".to_string(),
            args: vec!["-a".to_string(), "TextEdit".to_string()],
        }),
        (Platform::Macos, "explorer") => Ok(CommandSpec {
            program: "open".to_string(),
            args: vec![".".to_string()],
        }),
        (Platform::Macos, "taskmanager") => Err("任务管理器 暂不支持 macOS".to_string()),
        (Platform::Macos, "shutdown") => Err("关机 暂不支持 macOS".to_string()),
        (Platform::Macos, "restart") => Err("重启 暂不支持 macOS".to_string()),
        (_, other) => Err(format!("unsupported system command: {other}")),
    }
}

pub fn spawn_spec(spec: &CommandSpec) -> Result<(), String> {
    std::process::Command::new(&spec.program)
        .args(&spec.args)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn unsupported_on_macos(feature: &str) -> String {
    format!("{feature} 暂不支持 macOS")
}

#[tauri::command]
pub fn get_platform_capabilities() -> PlatformCapabilities {
    capabilities_for(current_platform())
}

#[tauri::command]
pub fn get_default_shell() -> (String, Vec<String>) {
    let spec = default_shell_spec(current_platform());
    (spec.program, spec.args)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_keep_windows_only_features_on_windows() {
        let caps = capabilities_for(Platform::Windows);
        assert_eq!(caps.platform, "windows");
        assert!(caps.supports_windows_rdp);
        assert!(caps.supports_windows_ocr);
        assert!(caps.supports_wsl);
        assert_eq!(caps.preferred_shortcut_modifier, "Ctrl+Alt");
    }

    #[test]
    fn capabilities_disable_windows_only_features_on_macos() {
        let caps = capabilities_for(Platform::Macos);
        assert_eq!(caps.platform, "macos");
        assert!(!caps.supports_windows_rdp);
        assert!(!caps.supports_windows_ocr);
        assert!(!caps.supports_wsl);
        assert_eq!(caps.preferred_shortcut_modifier, "Cmd+Opt");
    }

    #[test]
    fn default_shell_uses_powershell_on_windows() {
        let spec = default_shell_spec(Platform::Windows);
        assert_eq!(spec.program, "powershell.exe");
        assert!(spec.args.is_empty());
    }

    #[test]
    fn default_shell_uses_login_shell_on_macos() {
        let spec = default_shell_spec(Platform::Macos);
        assert!(!spec.program.is_empty());
        assert_eq!(spec.args, vec!["-l"]);
    }

    #[test]
    fn shell_run_preserves_command_text() {
        let spec = shell_run_spec(Platform::Windows, "echo hello");
        assert_eq!(spec.program, "powershell.exe");
        assert_eq!(spec.args, vec!["-NoExit", "-Command", "echo hello"]);
    }

    #[test]
    fn macos_app_bundle_launches_with_open() {
        assert_eq!(
            app_launch_spec(Platform::Macos, "/Applications/Example.app", &[]),
            CommandSpec {
                program: "open".to_string(),
                args: vec!["/Applications/Example.app".to_string()],
            }
        );
    }

    #[test]
    fn windows_app_launch_remains_direct() {
        assert_eq!(
            app_launch_spec(Platform::Windows, r"C:\Tools\app.exe", &["--flag".to_string()]),
            CommandSpec {
                program: r"C:\Tools\app.exe".to_string(),
                args: vec!["--flag".to_string()],
            }
        );
    }

    #[test]
    fn system_command_maps_calculator_per_platform() {
        assert_eq!(
            system_command_spec(Platform::Windows, "calculator"),
            Ok(CommandSpec {
                program: "calc.exe".to_string(),
                args: vec![],
            })
        );
        assert_eq!(
            system_command_spec(Platform::Macos, "calculator"),
            Ok(CommandSpec {
                program: "open".to_string(),
                args: vec!["-a".to_string(), "Calculator".to_string()],
            })
        );
    }

    #[test]
    fn system_command_rejects_taskmanager_on_macos() {
        assert_eq!(
            system_command_spec(Platform::Macos, "taskmanager"),
            Err("任务管理器 暂不支持 macOS".to_string())
        );
    }

    #[test]
    fn folder_fallback_uses_open_on_macos() {
        assert_eq!(
            folder_open_spec(Platform::Macos, "explorer", "/Users/example/project"),
            Ok(CommandSpec {
                program: "open".to_string(),
                args: vec!["/Users/example/project".to_string()],
            })
        );
    }
}
