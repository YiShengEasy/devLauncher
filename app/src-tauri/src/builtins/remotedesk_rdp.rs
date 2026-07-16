use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::env;
use std::path::{Path, PathBuf};
use tauri::Manager;

const CLIENT_EXECUTABLES: &[&str] = &[
    "mstsc.exe",
    "mstsc",
    "sdl-freerdp",
    "xfreerdp3",
    "xfreerdp",
    "wfreerdp.exe",
    "wfreerdp",
];
const HOST_EXECUTABLES: &[&str] = &["freerdp-shadow-cli", "grdctl", "systemctl"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HostOs {
    Windows,
    Linux,
    Macos,
    Other,
}

impl HostOs {
    fn current() -> Self {
        if cfg!(target_os = "windows") {
            Self::Windows
        } else if cfg!(target_os = "linux") {
            Self::Linux
        } else if cfg!(target_os = "macos") {
            Self::Macos
        } else {
            Self::Other
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Windows => "windows",
            Self::Linux => "linux",
            Self::Macos => "macos",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DesktopSession {
    WindowsConsole,
    X11,
    GnomeWayland,
    OtherWayland,
    MacosConsole,
    Unknown,
}

impl DesktopSession {
    fn current(os: HostOs) -> Self {
        match os {
            HostOs::Windows => Self::WindowsConsole,
            HostOs::Macos => Self::MacosConsole,
            HostOs::Linux => {
                let session_type = env::var("XDG_SESSION_TYPE")
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                let desktop = env::var("XDG_CURRENT_DESKTOP")
                    .unwrap_or_default()
                    .to_ascii_lowercase();
                if session_type == "wayland" {
                    if desktop.contains("gnome") {
                        Self::GnomeWayland
                    } else {
                        Self::OtherWayland
                    }
                } else if session_type == "x11" || env::var_os("DISPLAY").is_some() {
                    Self::X11
                } else {
                    Self::Unknown
                }
            }
            HostOs::Other => Self::Unknown,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::WindowsConsole => "windows_console",
            Self::X11 => "x11",
            Self::GnomeWayland => "gnome_wayland",
            Self::OtherWayland => "other_wayland",
            Self::MacosConsole => "macos_console",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RdpClientKind {
    #[default]
    Auto,
    System,
    FreeRdp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RdpHostBackend {
    FreeRdpShadow,
    GnomeRemoteDesktop,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpCapabilities {
    pub platform: String,
    pub desktop_session: String,
    pub clients: Vec<RdpClientKind>,
    pub host_backends: Vec<RdpHostBackend>,
    pub recommended_client: Option<RdpClientKind>,
    pub recommended_host: Option<RdpHostBackend>,
    pub host_error_code: Option<String>,
    pub executables: BTreeMap<String, String>,
}

#[derive(Debug, Clone)]
struct DetectionInput {
    os: HostOs,
    session: DesktopSession,
    executables: BTreeSet<String>,
}

fn contains_any(executables: &BTreeSet<String>, names: &[&str]) -> bool {
    names.iter().any(|name| executables.contains(*name))
}

fn detect_capabilities(input: &DetectionInput) -> RdpCapabilities {
    let has_system_client =
        input.os == HostOs::Windows && contains_any(&input.executables, &["mstsc.exe", "mstsc"]);
    let has_freerdp_client = contains_any(
        &input.executables,
        &[
            "sdl-freerdp",
            "xfreerdp3",
            "xfreerdp",
            "wfreerdp.exe",
            "wfreerdp",
        ],
    );
    let has_shadow = input.executables.contains("freerdp-shadow-cli");
    let has_gnome = input.executables.contains("grdctl") && input.executables.contains("systemctl");

    let mut clients = Vec::new();
    if has_system_client {
        clients.push(RdpClientKind::System);
    }
    if has_freerdp_client {
        clients.push(RdpClientKind::FreeRdp);
    }

    let recommended_client = if has_system_client {
        Some(RdpClientKind::System)
    } else if has_freerdp_client {
        Some(RdpClientKind::FreeRdp)
    } else {
        None
    };

    let (host_backends, recommended_host, host_error_code) = match (input.os, input.session) {
        (HostOs::Windows, DesktopSession::WindowsConsole) if has_shadow => (
            vec![RdpHostBackend::FreeRdpShadow],
            Some(RdpHostBackend::FreeRdpShadow),
            None,
        ),
        (HostOs::Linux, DesktopSession::X11) if has_shadow => (
            vec![RdpHostBackend::FreeRdpShadow],
            Some(RdpHostBackend::FreeRdpShadow),
            None,
        ),
        (HostOs::Linux, DesktopSession::GnomeWayland) if has_gnome => (
            vec![RdpHostBackend::GnomeRemoteDesktop],
            Some(RdpHostBackend::GnomeRemoteDesktop),
            None,
        ),
        (HostOs::Linux, DesktopSession::OtherWayland) => {
            (Vec::new(), None, Some("unsupported_wayland".to_string()))
        }
        (HostOs::Macos, _) => (Vec::new(), None, Some("macos_host_phase_2".to_string())),
        (HostOs::Windows | HostOs::Linux, _) => {
            (Vec::new(), None, Some("host_backend_missing".to_string()))
        }
        _ => (
            Vec::new(),
            None,
            Some("host_platform_unsupported".to_string()),
        ),
    };

    RdpCapabilities {
        platform: input.os.as_str().to_string(),
        desktop_session: input.session.as_str().to_string(),
        clients,
        host_backends,
        recommended_client,
        recommended_host,
        host_error_code,
        executables: BTreeMap::new(),
    }
}

fn executable_candidates(name: &str) -> Vec<String> {
    if cfg!(target_os = "windows") && Path::new(name).extension().is_none() {
        vec![name.to_string(), format!("{name}.exe")]
    } else {
        vec![name.to_string()]
    }
}

fn find_executable(name: &str, preferred_dirs: &[PathBuf]) -> Option<PathBuf> {
    let candidates = executable_candidates(name);
    for dir in preferred_dirs {
        for candidate in &candidates {
            let path = dir.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    for dir in env::split_paths(&env::var_os("PATH").unwrap_or_default()) {
        for candidate in &candidates {
            let path = dir.join(candidate);
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

fn discover_executables(preferred_dirs: &[PathBuf]) -> BTreeMap<String, PathBuf> {
    CLIENT_EXECUTABLES
        .iter()
        .chain(HOST_EXECUTABLES.iter())
        .filter_map(|name| {
            find_executable(name, preferred_dirs).map(|path| ((*name).to_string(), path))
        })
        .collect()
}

fn preferred_executable_dirs(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(executable) = env::current_exe() {
        if let Some(parent) = executable.parent() {
            dirs.push(parent.to_path_buf());
            dirs.push(parent.join("resources"));
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        dirs.push(resource_dir);
    }
    dirs
}

pub(crate) fn current_capabilities(app: &tauri::AppHandle) -> RdpCapabilities {
    let paths = discover_executables(&preferred_executable_dirs(app));
    let os = HostOs::current();
    let input = DetectionInput {
        os,
        session: DesktopSession::current(os),
        executables: paths.keys().cloned().collect(),
    };
    let mut capabilities = detect_capabilities(&input);
    capabilities.executables = paths
        .into_iter()
        .map(|(name, path)| (name, path.to_string_lossy().to_string()))
        .collect();
    capabilities
}

#[tauri::command]
pub fn get_rdp_capabilities(app: tauri::AppHandle) -> RdpCapabilities {
    current_capabilities(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env(os: HostOs, session: DesktopSession, bins: &[&str]) -> DetectionInput {
        DetectionInput {
            os,
            session,
            executables: bins.iter().map(|value| (*value).to_string()).collect(),
        }
    }

    #[test]
    fn selects_shadow_for_windows_current_desktop() {
        let result = detect_capabilities(&env(
            HostOs::Windows,
            DesktopSession::WindowsConsole,
            &["freerdp-shadow-cli", "mstsc"],
        ));
        assert_eq!(result.recommended_host, Some(RdpHostBackend::FreeRdpShadow));
        assert_eq!(result.recommended_client, Some(RdpClientKind::System));
    }

    #[test]
    fn selects_gnome_for_wayland_current_desktop() {
        let result = detect_capabilities(&env(
            HostOs::Linux,
            DesktopSession::GnomeWayland,
            &["grdctl", "systemctl", "xfreerdp"],
        ));
        assert_eq!(
            result.recommended_host,
            Some(RdpHostBackend::GnomeRemoteDesktop)
        );
    }

    #[test]
    fn rejects_unknown_wayland_instead_of_creating_an_independent_session() {
        let result = detect_capabilities(&env(
            HostOs::Linux,
            DesktopSession::OtherWayland,
            &["freerdp-shadow-cli"],
        ));
        assert_eq!(result.recommended_host, None);
        assert_eq!(
            result.host_error_code.as_deref(),
            Some("unsupported_wayland")
        );
    }

    #[test]
    fn gates_macos_host_but_allows_freerdp_client() {
        let result = detect_capabilities(&env(
            HostOs::Macos,
            DesktopSession::MacosConsole,
            &["sdl-freerdp"],
        ));
        assert_eq!(result.recommended_host, None);
        assert_eq!(result.recommended_client, Some(RdpClientKind::FreeRdp));
        assert_eq!(
            result.host_error_code.as_deref(),
            Some("macos_host_phase_2")
        );
    }
}
