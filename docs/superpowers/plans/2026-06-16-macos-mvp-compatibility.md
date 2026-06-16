# macOS MVP Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DevLauncher start and handle common launcher workflows on macOS while preserving the existing Windows behavior.

**Architecture:** Add narrow platform helpers on the TypeScript and Rust sides, then route existing shortcut registration, terminal startup, action execution, and UI option labels through those helpers. Windows-only capabilities return clear macOS messages instead of invoking missing Windows programs.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript 5.8, Vite 7, Vitest, portable-pty.

---

## Scope

This plan implements方案一: macOS first-run MVP compatibility. The supported MVP surface is:

- DevLauncher can start on macOS once Node/Rust/Tauri prerequisites exist.
- Main keyboard window can hide and be shown again.
- App process registers global shortcuts after configuration loads; the virtual keyboard does not need to be visible for registered bindings to work.
- macOS shortcut strings use Cmd+Opt for global app shortcuts and bound key shortcuts.
- File, folder, URL, built-in terminal, clipboard, and common launcher actions work on macOS.
- Windows-only actions return clear messages on macOS.

Out of scope for this plan:

- Native macOS OCR replacement.
- Full macOS RDP client integration.
- macOS Chrome Native Messaging installer.
- macOS packaged release signing and notarization.
- Linux support.

## Current Evidence

- `app/src/App.tsx` hardcodes `Ctrl+Alt+Space`, `Ctrl+Alt+V`, `Ctrl+Alt+K`, `Ctrl+Alt+P`, and per-key `Alt+KeyQ` / `Alt+Digit1`.
- `app/src-tauri/src/actions.rs` invokes Windows commands such as `wt.exe`, `cmd`, `powershell`, `explorer.exe`, `taskmgr.exe`, `shutdown`, and Git Bash paths.
- `app/src/builtins/terminal/App.tsx` already uses `bash` on non-Windows, but macOS should prefer the user's shell from `$SHELL` when available.
- `app/src-tauri/src/ocr.rs` already returns `"OCR is only supported on Windows in this MVP"` on non-Windows.
- `cargo` and `tsc` were not available in the current Codex shell during planning, so implementation verification must first confirm the developer machine toolchain.

## File Structure

- Create `app/src/platform/shortcuts.ts`
  - Owns TypeScript platform detection for shortcut strings and user-facing shortcut labels.
- Create `app/src/platform/shortcuts.test.ts`
  - Verifies macOS and Windows shortcut mappings without needing Tauri.
- Modify `app/src/App.tsx`
  - Replaces hardcoded global shortcut constants and `keyIdToShortcut` with the helper.
- Modify `app/src/components/SettingsPanel.tsx`
  - Displays platform-specific shortcut labels.
- Modify `app/src/components/ClipboardPanel.tsx`
  - Displays platform-specific clipboard shortcut label.
- Modify `app/src/components/BindingModal.tsx`
  - Uses platform-specific folder, SSH, script, and system command labels/options.
- Create `app/src-tauri/src/platform.rs`
  - Owns Rust platform-specific command selection, shell selection, unsupported messages, and testable command specs.
- Modify `app/src-tauri/src/lib.rs`
  - Registers the new module and exposes `get_platform_capabilities` / `get_default_shell`.
- Modify `app/src-tauri/src/actions.rs`
  - Replaces direct Windows command invocations with platform helper functions.
- Modify `app/src/builtins/terminal/App.tsx`
  - Uses `get_default_shell` before spawning the PTY.
- Modify `app/src-tauri/src/builtins/remotedesk.rs`
  - Returns a clear macOS message from Windows RDP launch.
- Modify `README.md` and `PROJECT_STRUCTURE.md`
  - Documents Windows/macOS support split and validation commands.

## Task 1: TypeScript Shortcut Platform Helper

**Files:**
- Create: `app/src/platform/shortcuts.ts`
- Create: `app/src/platform/shortcuts.test.ts`
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Write the failing shortcut tests**

Create `app/src/platform/shortcuts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getGlobalShortcuts,
  getGlobalShortcutLabels,
  isMacPlatform,
  keyIdToShortcut,
} from "./shortcuts";

describe("shortcut platform mapping", () => {
  it("detects macOS-like platform strings", () => {
    expect(isMacPlatform("MacIntel")).toBe(true);
    expect(isMacPlatform("MacPPC")).toBe(true);
    expect(isMacPlatform("Win32")).toBe(false);
    expect(isMacPlatform("Linux x86_64")).toBe(false);
  });

  it("keeps Windows shortcut behavior unchanged", () => {
    expect(getGlobalShortcuts("Win32")).toEqual({
      keyboard: "Ctrl+Alt+Space",
      clipboard: "Ctrl+Alt+V",
      search: "Ctrl+Alt+K",
      pet: "Ctrl+Alt+P",
    });
    expect(keyIdToShortcut("Q", "Win32")).toBe("Alt+KeyQ");
    expect(keyIdToShortcut("1", "Win32")).toBe("Alt+Digit1");
  });

  it("uses Cmd+Opt shortcuts on macOS", () => {
    expect(getGlobalShortcuts("MacIntel")).toEqual({
      keyboard: "CommandOrControl+Option+Space",
      clipboard: "CommandOrControl+Option+V",
      search: "CommandOrControl+Option+K",
      pet: "CommandOrControl+Option+P",
    });
    expect(keyIdToShortcut("Q", "MacIntel")).toBe("CommandOrControl+Option+KeyQ");
    expect(keyIdToShortcut("1", "MacIntel")).toBe("CommandOrControl+Option+Digit1");
  });

  it("returns readable labels for settings text", () => {
    expect(getGlobalShortcutLabels("Win32").search).toBe("Ctrl+Alt+K");
    expect(getGlobalShortcutLabels("MacIntel").search).toBe("Cmd+Opt+K");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
cd app
npx vitest run src/platform/shortcuts.test.ts
```

Expected: FAIL because `src/platform/shortcuts.ts` does not exist.

- [ ] **Step 3: Add the shortcut helper**

Create `app/src/platform/shortcuts.ts`:

```ts
export type GlobalShortcutId = "keyboard" | "clipboard" | "search" | "pet";

export type GlobalShortcutMap = Record<GlobalShortcutId, string>;

export function isMacPlatform(platform = navigator.platform): boolean {
  return platform.toLowerCase().startsWith("mac");
}

export function getGlobalShortcuts(platform = navigator.platform): GlobalShortcutMap {
  if (isMacPlatform(platform)) {
    return {
      keyboard: "CommandOrControl+Option+Space",
      clipboard: "CommandOrControl+Option+V",
      search: "CommandOrControl+Option+K",
      pet: "CommandOrControl+Option+P",
    };
  }

  return {
    keyboard: "Ctrl+Alt+Space",
    clipboard: "Ctrl+Alt+V",
    search: "Ctrl+Alt+K",
    pet: "Ctrl+Alt+P",
  };
}

export function getGlobalShortcutLabels(platform = navigator.platform): GlobalShortcutMap {
  if (isMacPlatform(platform)) {
    return {
      keyboard: "Cmd+Opt+Space",
      clipboard: "Cmd+Opt+V",
      search: "Cmd+Opt+K",
      pet: "Cmd+Opt+P",
    };
  }

  return getGlobalShortcuts(platform);
}

export function keyIdToShortcut(keyId: string, platform = navigator.platform): string {
  const keyPart = /^\d$/.test(keyId) ? `Digit${keyId}` : `Key${keyId}`;
  if (isMacPlatform(platform)) {
    return `CommandOrControl+Option+${keyPart}`;
  }
  return `Alt+${keyPart}`;
}
```

- [ ] **Step 4: Run the shortcut tests and verify they pass**

Run:

```bash
cd app
npx vitest run src/platform/shortcuts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Use the helper in `app/src/App.tsx`**

Modify the imports near the top of `app/src/App.tsx`:

```ts
import { getGlobalShortcuts, keyIdToShortcut } from "@/platform/shortcuts";
```

Remove the existing `GLOBAL_SHORTCUTS` constant and local `keyIdToShortcut` function. Add this constant near the other constants:

```ts
const GLOBAL_SHORTCUTS = getGlobalShortcuts();
```

The existing calls to `keyIdToShortcut(keyId)` and `GLOBAL_SHORTCUTS.keyboard` remain the same after the import.

- [ ] **Step 6: Run app tests**

Run:

```bash
cd app
npm run test
```

Expected: PASS for existing tests and `shortcuts.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add app/src/platform/shortcuts.ts app/src/platform/shortcuts.test.ts app/src/App.tsx
git commit -m "feat: add platform shortcut mapping"
```

## Task 2: Rust Platform Command Specs

**Files:**
- Create: `app/src-tauri/src/platform.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Write the platform module with tests first**

Create `app/src-tauri/src/platform.rs`:

```rust
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
                program: shell,
                args: vec!["-lc".to_string(), format!("{}; exec {}", command, shell)],
            }
        }
    }
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
}
```

- [ ] **Step 2: Register the module in `lib.rs`**

Modify the module declarations at the top of `app/src-tauri/src/lib.rs`:

```rust
mod actions;
mod builtins;
mod config;
mod entries;
mod ocr;
mod platform;
mod types;
mod utils;
```

Add these commands to the `tauri::generate_handler![...]` list:

```rust
platform::get_platform_capabilities,
platform::get_default_shell,
```

- [ ] **Step 3: Run Rust platform tests**

Run:

```bash
cd app/src-tauri
cargo test platform
```

Expected: PASS. If `cargo` is missing, install or activate Rust first, then rerun the same command.

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/platform.rs app/src-tauri/src/lib.rs
git commit -m "feat: add rust platform capabilities"
```

## Task 3: macOS-Aware Action Execution

**Files:**
- Modify: `app/src-tauri/src/actions.rs`
- Modify: `app/src-tauri/src/platform.rs`

- [ ] **Step 1: Add command mapping tests to `platform.rs`**

Append these tests inside the existing `#[cfg(test)] mod tests` block in `app/src-tauri/src/platform.rs`:

```rust
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
```

- [ ] **Step 2: Add command mapping helpers to `platform.rs`**

Add these functions above the test module in `app/src-tauri/src/platform.rs`:

```rust
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
        (Platform::Macos, "shutdown") => Err("关机 暂不支持 macOS".to_string()),
        (Platform::Macos, "restart") => Err("重启 暂不支持 macOS".to_string()),
        (Platform::Macos, "taskmanager") => Err("任务管理器 暂不支持 macOS".to_string()),
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
```

- [ ] **Step 3: Refactor imports in `actions.rs`**

At the top of `app/src-tauri/src/actions.rs`, add:

```rust
use crate::platform::{
    chrome_candidates, current_platform, folder_open_spec, shell_run_spec, spawn_spec,
    system_command_spec, unsupported_on_macos, Platform,
};
```

- [ ] **Step 4: Refactor folder opening in `actions.rs`**

Replace `folder_opener_candidates` and the non-custom branch of `open_folder_with` with:

```rust
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

    let spec = folder_open_spec(current_platform(), open_with, target)?;
    spawn_spec(&spec)
}
```

Remove the old `folder_opener_candidates` function after this replacement.

- [ ] **Step 5: Refactor Chrome candidate selection**

Delete the old local `chrome_candidates` function from `actions.rs`. In `open_url_action`, replace:

```rust
if spawn_first(&chrome_candidates(), std::slice::from_ref(&url)).is_ok() {
```

with:

```rust
if spawn_first(&chrome_candidates(current_platform()), std::slice::from_ref(&url)).is_ok() {
```

- [ ] **Step 6: Add macOS terminal behavior for SSH and scripts**

In the `"ssh"` match arm inside `execute_action`, add this platform branch before the password-specific `launch_gitbash_expect` / `launch_plink` section:

```rust
if current_platform() != Platform::Windows {
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
```

In the `"script"` match arm, replace the `"powershell"` branch with:

```rust
"powershell" => {
    if current_platform() == Platform::Windows {
        std::process::Command::new("powershell")
            .args(["-NoExit", "-Command", content])
            .spawn()
            .map_err(|e| e.to_string())?;
    } else {
        let spec = shell_run_spec(current_platform(), content);
        spawn_spec(&spec)?;
    }
}
```

In the `"wsl"` branch, add this guard before launching `wt.exe`:

```rust
if current_platform() != Platform::Windows {
    return Err(unsupported_on_macos("WSL 脚本"));
}
```

- [ ] **Step 7: Refactor system commands**

Replace the entire `"system"` match arm body with:

```rust
"system" => {
    let cmd = action["command"].as_str().unwrap_or("");
    let spec = system_command_spec(current_platform(), cmd)?;
    spawn_spec(&spec)?;
}
```

- [ ] **Step 8: Run Rust tests**

Run:

```bash
cd app/src-tauri
cargo test platform
cargo check
```

Expected: PASS. On macOS, `cargo check` must not fail because of direct Windows command references.

- [ ] **Step 9: Commit**

```bash
git add app/src-tauri/src/platform.rs app/src-tauri/src/actions.rs
git commit -m "feat: adapt launcher actions for macos"
```

## Task 4: Terminal Default Shell Integration

**Files:**
- Modify: `app/src/builtins/terminal/App.tsx`
- Modify: `app/src-tauri/src/platform.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Verify `get_default_shell` is registered**

Confirm `app/src-tauri/src/lib.rs` includes this handler from Task 2:

```rust
platform::get_default_shell,
```

- [ ] **Step 2: Update terminal frontend shell selection**

In `app/src/builtins/terminal/App.tsx`, replace:

```ts
const shell = navigator.platform.startsWith("Win") ? "powershell.exe" : "bash";
```

with:

```ts
type ShellSpec = [string, string[]];
```

Then replace the `invoke<string | null>("terminal_take_pending_cmd").then((pendingCmd) => { ... })` block with:

```ts
Promise.all([
  invoke<string | null>("terminal_take_pending_cmd"),
  invoke<ShellSpec>("get_default_shell").catch((): ShellSpec => {
    return navigator.platform.startsWith("Win") ? ["powershell.exe", []] : ["/bin/zsh", ["-l"]];
  }),
]).then(([pendingCmd, defaultShell]) => {
  const [shellProgram, shellArgs] = defaultShell;
  if (pendingCmd) {
    if (navigator.platform.startsWith("Win")) {
      spawnPty("powershell.exe", ["-NoExit", "-Command", pendingCmd]);
    } else {
      spawnPty(shellProgram, ["-lc", `${pendingCmd}; exec ${shellProgram}`]);
    }
    setTitle(pendingCmd.slice(0, 40));
  } else {
    spawnPty(shellProgram, shellArgs);
  }
});
```

- [ ] **Step 3: Run frontend build**

Run:

```bash
cd app
npm run build
```

Expected: PASS. If `tsc` is missing, run `npm install` in `app` first, then rerun `npm run build`.

- [ ] **Step 4: Run Rust check**

Run:

```bash
cd app/src-tauri
cargo check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/builtins/terminal/App.tsx app/src-tauri/src/platform.rs app/src-tauri/src/lib.rs
git commit -m "feat: use platform default shell in terminal"
```

## Task 5: Platform-Aware UI Labels and Options

**Files:**
- Modify: `app/src/components/SettingsPanel.tsx`
- Modify: `app/src/components/ClipboardPanel.tsx`
- Modify: `app/src/components/BindingModal.tsx`
- Modify: `app/src/types/actions.ts`

- [ ] **Step 1: Add user-facing shortcut labels to settings**

In `app/src/components/SettingsPanel.tsx`, import:

```ts
import { getGlobalShortcutLabels } from "@/platform/shortcuts";
```

Inside the component function, add:

```ts
const shortcutLabels = getGlobalShortcutLabels();
```

Replace hardcoded text containing `Ctrl+Alt+K` and `Ctrl+Alt+P` with template text using:

```tsx
快捷键：{shortcutLabels.search}。搜索键盘绑定、内置功能和最近动作。
```

and:

```tsx
快捷键：{shortcutLabels.pet}。打开搜索、截图报告、剪切板、键盘模式和隐藏操作；可拖动并保存位置。
```

- [ ] **Step 2: Add user-facing shortcut labels to clipboard**

In `app/src/components/ClipboardPanel.tsx`, import:

```ts
import { getGlobalShortcutLabels } from "@/platform/shortcuts";
```

Inside the component function, add:

```ts
const shortcutLabels = getGlobalShortcutLabels();
```

Replace:

```tsx
点击复制 · Esc 关闭 · Ctrl+Alt+V 唤起
```

with:

```tsx
点击复制 · Esc 关闭 · {shortcutLabels.clipboard} 唤起
```

- [ ] **Step 3: Keep TypeScript action schema backward-compatible**

In `app/src/types/actions.ts`, keep these existing union members:

```ts
export type FolderOpenWith = "explorer" | "vscode" | "cursor" | "custom";
export type SshTerminal = "auto" | "wt" | "cmd" | "powershell" | "gitbash" | "terminal";
export interface ScriptAction extends ActionBase {
  type: "script";
  shell: "powershell" | "cmd" | "bat" | "wsl" | "terminal";
  content: string;
  file?: string;
}
```

Do not add macOS-specific enum values in this MVP. The Rust side maps existing values to macOS behavior so stored configs remain compatible.

- [ ] **Step 4: Hide or relabel Windows-specific options in `BindingModal.tsx`**

In `app/src/components/BindingModal.tsx`, import:

```ts
import { isMacPlatform } from "@/platform/shortcuts";
```

Inside the component function, add:

```ts
const isMac = isMacPlatform();
```

For folder opener labels, change the `explorer` option text to:

```tsx
{isMac ? "Finder" : "文件资源管理器"}
```

For SSH terminal options, render Windows-only options only when `!isMac`:

```tsx
{!isMac && <option value="wt" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Windows Terminal (wt.exe)</option>}
{!isMac && <option value="cmd" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Command Prompt</option>}
{!isMac && <option value="powershell" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>PowerShell</option>}
{!isMac && <option value="gitbash" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>Git Bash</option>}
<option value="terminal" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>DevLauncher 终端</option>
```

For script shell options, render Windows-only options only when `!isMac` and always keep `terminal`:

```tsx
{!isMac && <option value="powershell" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>PowerShell</option>}
{!isMac && <option value="cmd" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>CMD</option>}
{!isMac && <option value="bat" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>BAT</option>}
{!isMac && <option value="wsl" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>WSL</option>}
<option value="terminal" style={{ background: "#1a1c2e", color: "#e8eaf0" }}>DevLauncher 终端</option>
```

- [ ] **Step 5: Reset incompatible default shell on macOS**

Near the existing shell state in `BindingModal.tsx`, replace:

```ts
const [shell, setShell]     = useState<"powershell"|"cmd"|"bat"|"wsl"|"terminal">((initialAction as ScriptAction)?.shell ?? "powershell");
```

with:

```ts
const initialScriptShell = (initialAction as ScriptAction)?.shell;
const safeInitialScriptShell = isMacPlatform() ? "terminal" : (initialScriptShell ?? "powershell");
const [shell, setShell] = useState<"powershell" | "cmd" | "bat" | "wsl" | "terminal">(safeInitialScriptShell);
```

- [ ] **Step 6: Run frontend build and tests**

Run:

```bash
cd app
npm run build
npm run test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/SettingsPanel.tsx app/src/components/ClipboardPanel.tsx app/src/components/BindingModal.tsx app/src/types/actions.ts
git commit -m "feat: show platform-aware launcher options"
```

## Task 6: Clear macOS Degradation for Windows-Only Built-Ins

**Files:**
- Modify: `app/src-tauri/src/builtins/remotedesk.rs`
- Modify: `app/src/builtins/remotedesk/App.tsx`
- Modify: `app/src/builtins/webaccounts/App.tsx`

- [ ] **Step 1: Return clear RDP launch errors on non-Windows**

In `app/src-tauri/src/builtins/remotedesk.rs`, add a platform guard at the start of `launch_rdp`:

```rust
#[tauri::command]
pub fn launch_rdp(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if !cfg!(target_os = "windows") {
        return Err("RDP/mstsc 暂不支持 macOS；可以先使用远程桌面的 Host/Connect 能力或系统自带远程工具。".to_string());
    }

    // existing Windows implementation remains below
```

Keep the existing Windows implementation after the guard.

- [ ] **Step 2: Show platform capability message in RemoteDesk UI**

In `app/src/builtins/remotedesk/App.tsx`, import:

```ts
import { invoke } from "@tauri-apps/api/core";
```

If `invoke` is already imported in the file, do not duplicate the import. Add this type near the top:

```ts
interface PlatformCapabilities {
  platform: string;
  supportsWindowsRdp: boolean;
  supportsWindowsOcr: boolean;
  supportsWsl: boolean;
  preferredShortcutModifier: string;
}
```

Inside the component that owns the RDP tab, add:

```ts
const [platformCaps, setPlatformCaps] = useState<PlatformCapabilities | null>(null);

useEffect(() => {
  invoke<PlatformCapabilities>("get_platform_capabilities")
    .then(setPlatformCaps)
    .catch(() => setPlatformCaps(null));
}, []);
```

At the top of the RDP tab render, show:

```tsx
{platformCaps && !platformCaps.supportsWindowsRdp && (
  <div style={{ color: "#fbbf24", fontSize: 12, marginBottom: 12 }}>
    macOS 当前不支持 mstsc/RDP 一键启动；此页其他远程能力可继续按实际权限验证。
  </div>
)}
```

- [ ] **Step 3: Replace Windows-only native host path text in WebAccounts UI**

In `app/src/builtins/webaccounts/App.tsx`, find the text that shows:

```tsx
<code style={codeStyle}>app/src-tauri/target/debug/devlauncher_native_host.exe</code>
```

Replace it with:

```tsx
<code style={codeStyle}>
  {navigator.platform.startsWith("Mac")
    ? "app/src-tauri/target/debug/devlauncher_native_host"
    : "app/src-tauri/target/debug/devlauncher_native_host.exe"}
</code>
```

Add a macOS note near the native messaging setup instructions:

```tsx
{navigator.platform.startsWith("Mac") && (
  <p style={{ color: "#fbbf24", fontSize: 12 }}>
    macOS Native Messaging 注册路径与 Windows 注册表不同，本版本先展示二进制路径，自动安装脚本不在 macOS MVP 范围内。
  </p>
)}
```

- [ ] **Step 4: Run build checks**

Run:

```bash
cd app
npm run build
cd src-tauri
cargo check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/src/builtins/remotedesk.rs app/src/builtins/remotedesk/App.tsx app/src/builtins/webaccounts/App.tsx
git commit -m "feat: clarify macos built-in support"
```

## Task 7: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `PROJECT_STRUCTURE.md`

- [ ] **Step 1: Update README platform status**

In `README.md`, replace:

```md
Developer productivity launcher for Windows.
```

with:

```md
Developer productivity launcher for Windows and macOS MVP workflows.
```

Replace the platform badge line with:

```md
![platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20MVP-lightgrey)
```

Replace the Requirements section with:

```md
Requirements:

- Windows with WebView2, or macOS with system WebView support
- Node.js 18+
- Rust stable with Cargo available on PATH
```

Add this subsection under Shortcuts:

```md
### macOS Shortcut Behavior

DevLauncher must be running before global shortcuts work. The virtual keyboard window can be hidden after startup; registered key bindings still work while the app process is running in the background.

Default macOS shortcuts:

| Shortcut | Behavior |
| --- | --- |
| `Cmd+Opt+Space` | Show or hide the main DevLauncher window. |
| `Cmd+Opt+<key>` | Trigger the binding for a key on the active page. |
| `Cmd+Opt+V` | Open clipboard history. |
| `Cmd+Opt+K` | Open search. |
| `Cmd+Opt+P` | Open pet/entry mode. |
```

- [ ] **Step 2: Update project structure notes**

In `PROJECT_STRUCTURE.md`, add this section after `## Rust Backend`:

```md
## Platform Compatibility

Platform-specific behavior is centralized in:

```text
app/src/platform/shortcuts.ts      # Frontend shortcut strings and labels
app/src-tauri/src/platform.rs      # Rust command specs, shell defaults, capabilities
```

Do not add direct `cmd`, `powershell`, `explorer.exe`, `mstsc`, or `open -a` calls in feature modules when a platform helper can own the choice.
```

- [ ] **Step 3: Run UTF-8 validation**

Run:

```bash
pwsh -File scripts/check-utf8.ps1
```

Expected: PASS. If `pwsh` is not installed on macOS, run:

```bash
python3 - <<'PY'
from pathlib import Path
for path in Path(".").rglob("*"):
    if path.is_file() and ".git" not in path.parts and "node_modules" not in path.parts and "target" not in path.parts:
        try:
            path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise SystemExit(f"{path}: {exc}")
print("UTF-8 validation passed")
PY
```

Expected: prints `UTF-8 validation passed`.

- [ ] **Step 4: Run final automated verification**

Run:

```bash
cd app
npm run test
npm run build
cd src-tauri
cargo test platform
cargo check
```

Expected: all commands pass.

- [ ] **Step 5: Run macOS manual verification**

Run:

```bash
cd app
npm run tauri dev
```

Expected:

- DevLauncher main window opens.
- `Cmd+Opt+Space` hides or shows the main window.
- A configured URL binding opens in the default browser.
- A configured folder binding opens Finder.
- Built-in terminal opens and starts the user's login shell.
- A script binding using `terminal` runs in the built-in terminal.
- RDP launch on macOS shows the explicit unsupported message.

- [ ] **Step 6: Commit**

```bash
git add README.md PROJECT_STRUCTURE.md
git commit -m "docs: document macos mvp compatibility"
```

## Self-Review

- Spec coverage: The plan covers macOS app startup prerequisites, background shortcut behavior, platform-specific shortcut mapping, file/folder/URL actions, terminal shell selection, Windows-only degradation, and verification.
- Placeholder scan: No task relies on unspecified code. Each changed helper includes concrete code snippets and exact commands.
- Type consistency: `GlobalShortcutMap`, `PlatformCapabilities`, `CommandSpec`, `Platform`, `getGlobalShortcuts`, `getGlobalShortcutLabels`, `keyIdToShortcut`, `get_platform_capabilities`, and `get_default_shell` are defined before later tasks reference them.

Plan complete and saved to `docs/superpowers/plans/2026-06-16-macos-mvp-compatibility.md`. Two execution options:

**1. Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
