# Cross-Platform RDP Phase 1A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make standards-compatible RDP the primary DevLauncher remote-desktop path for installed Windows/Linux backends while retaining the JPEG-over-WebSocket implementation as an explicit compatibility mode.

**Architecture:** Add a focused Rust RDP service beside the legacy transport. The service detects platform capabilities, launches native RDP clients, manages session-scoped credentials, and starts either FreeRDP Shadow or GNOME Remote Desktop through adapter-specific command specifications. React consumes structured capability and status objects and preserves the current visual system.

**Tech Stack:** Tauri 2, Rust, serde, keyring, FreeRDP 3 command-line tools, GNOME Remote Desktop `grdctl`, React 19, TypeScript, Vitest.

---

## Scope Boundary

This plan is Phase 1A and produces independently testable software:

- Detect installed RDP clients and current-desktop host backends.
- Launch RDP profiles on Windows, Linux, and macOS when a compatible client exists.
- Manage Windows FreeRDP Shadow, Linux X11 FreeRDP Shadow, and GNOME Wayland remote-assistance mode when their tools are installed.
- Expose structured status and errors in the existing UI.
- Keep the current WebSocket transport under an explicit compatibility label.
- Keep public RDP tunneling disabled; Phase 1B adds explicit TCP tunneling after host interoperability passes.

Phase 1B will pin, build, sign, bundle, and release platform FreeRDP binaries only after the Windows/Linux manual matrix passes. macOS hosting remains Phase 2. This boundary matters because current FreeRDP source marks the Windows and macOS Shadow subsystems as unmaintained; DevLauncher must verify the actual target build before distributing it as a default backend.

## File Structure

- Create: `app/src-tauri/src/builtins/remotedesk_rdp.rs`
  - RDP types, executable discovery, adapter selection, command specifications, credentials, lifecycle state, and Tauri commands.
- Create: `app/src/builtins/remotedesk/rdpModel.ts`
  - Frontend RDP DTOs, labels, and pure status helpers.
- Create: `app/src/builtins/remotedesk/rdpModel.test.ts`
  - Frontend compatibility, label, and status tests.
- Modify: `app/src-tauri/src/builtins/mod.rs`
  - Export the focused RDP module.
- Modify: `app/src-tauri/src/builtins/remotedesk.rs`
  - Preserve profile persistence and legacy transport while delegating RDP launch behavior.
- Modify: `app/src-tauri/src/lib.rs`
  - Register new RDP commands and initialize RDP host state.
- Modify: `app/src-tauri/Cargo.toml`
  - Add MD4 hashing and secret-zeroing dependencies.
- Modify: `app/src/builtins/remotedesk/App.tsx`
  - Add client selection, primary RDP host status, and compatibility labels using existing styling.
- Modify: `app/src-tauri/tauri.conf.json`
  - No sidecar entry in Phase 1A; document-only review confirms packaging remains unchanged.

## Task 1: Add RDP Capability Types And Backend Detection

**Files:**
- Create: `app/src-tauri/src/builtins/remotedesk_rdp.rs`
- Modify: `app/src-tauri/src/builtins/mod.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for platform selection**

Add the module skeleton and tests that inject an environment instead of reading the real machine:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn env(os: HostOs, session: DesktopSession, bins: &[&str]) -> DetectionInput {
        DetectionInput {
            os,
            session,
            executables: bins.iter().map(|v| (*v).to_string()).collect(),
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
        assert_eq!(result.recommended_host, Some(RdpHostBackend::GnomeRemoteDesktop));
    }

    #[test]
    fn rejects_unknown_wayland_instead_of_creating_an_independent_session() {
        let result = detect_capabilities(&env(
            HostOs::Linux,
            DesktopSession::OtherWayland,
            &["freerdp-shadow-cli"],
        ));
        assert_eq!(result.recommended_host, None);
        assert_eq!(result.host_error_code.as_deref(), Some("unsupported_wayland"));
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
        assert_eq!(result.host_error_code.as_deref(), Some("macos_host_phase_2"));
    }
}
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cargo test --manifest-path app/src-tauri/Cargo.toml remotedesk_rdp::tests -- --nocapture
```

Expected: FAIL because the RDP types and `detect_capabilities` are not defined.

- [ ] **Step 3: Implement serializable capability types and pure selection**

Define these stable values in `remotedesk_rdp.rs`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HostOs { Windows, Linux, Macos, Other }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DesktopSession { WindowsConsole, X11, GnomeWayland, OtherWayland, MacosConsole, Unknown }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RdpClientKind { Auto, System, FreeRdp }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RdpHostBackend { FreeRdpShadow, GnomeRemoteDesktop }

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
}
```

Implement executable discovery by checking the application directory first and then each `PATH` entry. Recognize `mstsc.exe`, `sdl-freerdp`, `xfreerdp3`, `xfreerdp`, `wfreerdp.exe`, `freerdp-shadow-cli`, `grdctl`, and `systemctl`.

Detect Linux sessions from `XDG_SESSION_TYPE`, `XDG_CURRENT_DESKTOP`, and `DISPLAY`. Keep `detect_capabilities(DetectionInput)` pure; the Tauri command `get_rdp_capabilities` builds real input and calls it.

- [ ] **Step 4: Register the module and capability command**

Add `pub mod remotedesk_rdp;` to `builtins/mod.rs`, add `builtins::remotedesk_rdp::get_rdp_capabilities` to `generate_handler!`, and call `builtins::remotedesk_rdp::setup(app)` beside the existing remote-desk setup.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cargo test --manifest-path app/src-tauri/Cargo.toml remotedesk_rdp::tests -- --nocapture
cargo check --manifest-path app/src-tauri/Cargo.toml
```

Expected: capability tests PASS and `cargo check` exits 0.

Commit:

```bash
git add app/src-tauri/src/builtins/remotedesk_rdp.rs app/src-tauri/src/builtins/mod.rs app/src-tauri/src/lib.rs
git commit -m "feat: detect RDP clients and host backends"
```

## Task 2: Migrate Profiles And Launch Cross-Platform RDP Clients

**Files:**
- Modify: `app/src-tauri/src/builtins/remotedesk.rs`
- Modify: `app/src-tauri/src/builtins/remotedesk_rdp.rs`

- [ ] **Step 1: Write failing tests for profile defaults and launch specifications**

Add tests covering old JSON and client arguments:

```rust
#[test]
fn old_profile_defaults_to_auto_client() {
    let profile: RemoteDeskProfile = serde_json::from_str(
        r#"{"id":"one","name":"Lab","host":"10.0.0.8","port":3389,"username":"dev"}"#,
    ).unwrap();
    assert_eq!(profile.client_mode, RdpClientKind::Auto);
}

#[test]
fn freerdp_launch_spec_contains_endpoint_and_username_but_not_password() {
    let profile = fixture_profile(RdpClientKind::FreeRdp);
    let spec = build_client_spec(&profile, "/usr/bin/sdl-freerdp").unwrap();
    assert!(spec.args.contains(&"/v:10.0.0.8:3389".to_string()));
    assert!(spec.args.contains(&"/u:dev".to_string()));
    assert!(spec.args.iter().all(|arg| !arg.starts_with("/p:")));
}
```

- [ ] **Step 2: Run the tests and verify they fail**

Run the same focused Rust test command. Expected: FAIL because `client_mode` and client command specifications do not exist.

- [ ] **Step 3: Add a backward-compatible client preference**

Move or import `RdpClientKind` and extend the persisted profile:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RemoteDeskProfile {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub client_mode: RdpClientKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_password: Option<bool>,
}
```

Implement `Default` for `RdpClientKind` as `Auto` so existing profile files remain valid.

- [ ] **Step 4: Replace the Windows-only launcher with a delegated launcher**

Keep `launch_rdp` in `remotedesk.rs` as the Tauri compatibility command, but delegate to `remotedesk_rdp::launch_profile`. Return a structured result:

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpLaunchResult {
    pub client: RdpClientKind,
    pub executable: String,
}
```

Selection rules:

- `auto`: prefer `mstsc` on Windows, otherwise FreeRDP.
- `system`: require `mstsc` on Windows; return `rdp_system_client_missing` elsewhere.
- `freerdp`: use the first discovered FreeRDP executable.

For FreeRDP, pass endpoint and username but let the client prompt for a password in Phase 1A unless a verified non-command-line secret input mechanism is available. Never append `/p:<password>`.

For mstsc, preserve the existing Windows Credential Manager flow through `cmdkey`, launch mstsc, and schedule removal of the `TERMSRV/<host>` credential after the client starts.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cargo test --manifest-path app/src-tauri/Cargo.toml remotedesk -- --nocapture
cargo check --manifest-path app/src-tauri/Cargo.toml
```

Expected: old profiles deserialize, command specs contain no password, and the crate checks successfully.

Commit:

```bash
git add app/src-tauri/src/builtins/remotedesk.rs app/src-tauri/src/builtins/remotedesk_rdp.rs
git commit -m "feat: launch RDP profiles across platforms"
```

## Task 3: Add Session Credentials And Managed Host Lifecycle

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Modify: `app/src-tauri/src/builtins/remotedesk_rdp.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing tests for credentials, cleanup, and host state**

Add tests that use a temporary directory and a fake process specification:

```rust
#[test]
fn sam_entry_contains_nt_hash_and_not_plaintext_password() {
    let entry = build_sam_entry("devlauncher", "Correct Horse Battery Staple!");
    assert!(entry.starts_with("devlauncher:::"));
    assert!(!entry.contains("Correct Horse"));
    assert_eq!(entry.trim().split(':').nth(3).unwrap().len(), 32);
}

#[test]
fn stopping_runtime_removes_session_material() {
    let temp = tempfile::tempdir().unwrap();
    let sam = temp.path().join("SAM");
    std::fs::write(&sam, "secret").unwrap();
    cleanup_session_files(&[sam.clone()]);
    assert!(!sam.exists());
}

#[test]
fn shadow_spec_enables_nla_and_interaction() {
    let spec = build_shadow_spec("freerdp-shadow-cli", 3391, "/tmp/SAM");
    assert!(spec.args.contains(&"/sec:nla".to_string()));
    assert!(spec.args.contains(&"/sam-file:/tmp/SAM".to_string()));
    assert!(spec.args.contains(&"+may-interact".to_string()));
}
```

- [ ] **Step 2: Add secret dependencies and verify the tests fail**

Add to `Cargo.toml`:

```toml
md-4 = "0.10"
tempfile = "3"
zeroize = "1"
```

Run the focused tests. Expected: FAIL because credential and lifecycle helpers are missing.

- [ ] **Step 3: Implement safe session material**

Generate a 24-character password from unambiguous upper-case, lower-case, digit, and symbol sets. Calculate the NT hash as MD4 of the UTF-16LE password and write this FreeRDP SAM format:

```text
devlauncher:::<32 lowercase hex NT hash>:::
```

Create the session directory under `app_cache_dir()/remotedesk-rdp/<session-id>`. On Unix, set directory mode `0700` and files to `0600`. Store the plaintext password only in the host runtime object wrapped by `Zeroizing<String>` and in the command return value required for display.

- [ ] **Step 4: Add managed RDP host state and commands**

Define:

```rust
pub struct RdpHostState {
    runtime: Mutex<Option<RdpHostRuntime>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpHostInfo {
    pub backend: RdpHostBackend,
    pub address: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub tls: bool,
    pub nla: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RdpHostStatus {
    pub running: bool,
    pub backend: Option<RdpHostBackend>,
    pub address: Option<String>,
    pub port: Option<u16>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}
```

Register `start_rdp_host`, `stop_rdp_host`, and `get_rdp_host_status`. The start command:

1. Refuses macOS with `macos_host_phase_2`.
2. Refuses unsupported Wayland with `unsupported_wayland`.
3. Stops only the runtime already owned by DevLauncher.
4. Chooses a free port, preferring 3389 then an OS-assigned port.
5. Creates credentials and the adapter command.
6. Spawns the child with piped stderr.
7. Probes the TCP port for up to five seconds.
8. Kills the child and cleans files when readiness fails.

The status command checks `Child::try_wait` and converts an unexpected exit to `host_exited` with a redacted stderr tail.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cargo test --manifest-path app/src-tauri/Cargo.toml remotedesk_rdp::tests -- --nocapture
cargo check --manifest-path app/src-tauri/Cargo.toml
git diff --check
```

Expected: tests PASS, no plaintext test password appears in generated SAM output, and checks exit 0.

Commit:

```bash
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock app/src-tauri/src/builtins/remotedesk_rdp.rs app/src-tauri/src/lib.rs
git commit -m "feat: manage secure RDP host sessions"
```

## Task 4: Implement GNOME Wayland Remote-Assistance Adapter

**Files:**
- Modify: `app/src-tauri/src/builtins/remotedesk_rdp.rs`

- [ ] **Step 1: Write failing command-spec and restoration tests**

Model commands as data so tests do not modify the developer machine:

```rust
#[test]
fn gnome_start_plan_uses_remote_assistance_user_service() {
    let plan = build_gnome_plan("devlauncher", Path::new("/tmp/rdp"));
    assert!(plan.commands.iter().any(|c| c.args == vec![
        "--user".to_string(),
        "enable".to_string(),
        "--now".to_string(),
        "gnome-remote-desktop.service".to_string(),
    ]));
    assert!(plan.commands.iter().all(|c| !c.args.contains(&"--headless".to_string())));
}

#[test]
fn gnome_plan_sends_credentials_via_stdin() {
    let plan = build_gnome_plan("devlauncher", Path::new("/tmp/rdp"));
    let command = plan.commands.iter().find(|c| c.args.ends_with(&[
        "rdp".to_string(),
        "set-credentials".to_string(),
    ])).unwrap();
    assert_eq!(command.stdin_secret, Some(SecretInput::UsernameAndPassword));
}
```

- [ ] **Step 2: Run tests and verify they fail**

Run the focused tests. Expected: FAIL because the GNOME plan does not exist.

- [ ] **Step 3: Build and execute a reversible GNOME command plan**

Use user-session remote assistance, never `--headless` and never the system GDM remote-login service. The plan must:

- Generate a session certificate with `winpr-makecert` when available, otherwise return `certificate_tool_missing`.
- Call `grdctl rdp set-tls-key`, `set-tls-cert`, and `set-credentials`.
- Pipe username and password to `set-credentials` through stdin.
- Call `grdctl rdp disable-view-only` and `grdctl rdp enable`.
- Start `gnome-remote-desktop.service` through `systemctl --user`.
- Record whether the service and RDP backend were already enabled before DevLauncher changed them.

On stop, disable only settings DevLauncher enabled. Never overwrite an already-running GNOME Remote Desktop configuration; return `existing_rdp_service` and tell the user to connect with its existing credentials instead.

- [ ] **Step 4: Run tests and commit**

Run Rust tests and `cargo check`. Expected: all pass without invoking `grdctl` on the current macOS machine.

Commit:

```bash
git add app/src-tauri/src/builtins/remotedesk_rdp.rs
git commit -m "feat: support GNOME Wayland RDP assistance"
```

## Task 5: Add Frontend RDP Models And Profile Client Selection

**Files:**
- Create: `app/src/builtins/remotedesk/rdpModel.ts`
- Create: `app/src/builtins/remotedesk/rdpModel.test.ts`
- Modify: `app/src/builtins/remotedesk/App.tsx`

- [ ] **Step 1: Write failing frontend model tests**

```ts
import { describe, expect, it } from "vitest";
import { clientLabel, hostAvailabilityMessage, normalizeProfile } from "./rdpModel";

describe("RDP frontend model", () => {
  it("defaults old profiles to auto", () => {
    expect(normalizeProfile({ id: "1", name: "Lab", host: "host", port: 3389, username: "dev" }).client_mode).toBe("auto");
  });

  it("uses stable Chinese client labels", () => {
    expect(clientLabel("auto")).toBe("自动选择");
    expect(clientLabel("system")).toBe("系统 RDP");
    expect(clientLabel("freerdp")).toBe("FreeRDP");
  });

  it("explains unsupported Wayland", () => {
    expect(hostAvailabilityMessage("unsupported_wayland")).toContain("Wayland");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm --prefix app exec vitest run src/builtins/remotedesk/rdpModel.test.ts
```

Expected: FAIL because `rdpModel.ts` does not exist.

- [ ] **Step 3: Implement DTOs and pure display helpers**

Export `RdpClientKind`, `RdpHostBackend`, `RdpCapabilities`, `RdpHostInfo`, `RdpHostStatus`, `RemoteDeskProfile`, `clientLabel`, `backendLabel`, `hostAvailabilityMessage`, and `normalizeProfile`. Match Rust `camelCase` response fields exactly and persisted profile `snake_case` exactly.

- [ ] **Step 4: Add the profile client selector without changing layout style**

Import model types into `App.tsx`, normalize loaded profiles, add a native `<select>` under the existing port/password row, and send `client_mode` during save. Replace the hard-coded “已启动 mstsc” message with the `RdpLaunchResult.client` label.

Remove the old `supportsWindowsRdp` warning and replace it with capability data from `get_rdp_capabilities`.

- [ ] **Step 5: Run tests, build, and commit**

Run:

```bash
npm --prefix app exec vitest run src/builtins/remotedesk/rdpModel.test.ts
npm --prefix app run build
```

Expected: model tests PASS and TypeScript/Vite build exits 0.

Commit:

```bash
git add app/src/builtins/remotedesk/rdpModel.ts app/src/builtins/remotedesk/rdpModel.test.ts app/src/builtins/remotedesk/App.tsx
git commit -m "feat: add RDP client selection to profiles"
```

## Task 6: Make RDP Hosting Primary And Relabel Compatibility Mode

**Files:**
- Modify: `app/src/builtins/remotedesk/App.tsx`
- Modify: `app/src/builtins/remotedesk/rdpModel.test.ts`

- [ ] **Step 1: Add failing host-status formatting tests**

Add tests proving that the UI distinguishes RDP and compatibility transports and never displays a password after host stop:

```ts
it("labels the legacy transport as compatibility mode", () => {
  expect(transportLabel("websocket_jpeg")).toBe("兼容模式");
});

it("hides credentials when the RDP host is stopped", () => {
  expect(visibleHostCredentials({ running: false, backend: null, address: null, port: null, errorCode: null, errorMessage: null }, null)).toBeNull();
});
```

- [ ] **Step 2: Split the current host UI into primary and compatibility sections**

Keep the existing three tabs but change their labels to:

```ts
[
  { id: "rdp", label: "连接" },
  { id: "host", label: "我的设备" },
  { id: "connect", label: "兼容连接" },
]
```

At the top of `HostTab`, add the RDP host control using `start_rdp_host`, `stop_rdp_host`, and two-second `get_rdp_host_status` polling. Show compact rows for backend, desktop type, endpoint, TLS/NLA, username, and temporary password. Use the existing `InfoRow`, button styles, spacing, and colors.

Move the existing WebSocket start/stop block under a collapsed section titled `JPEG/WebSocket 兼容模式`. Keep its behavior and stored frp/ngrok settings intact.

- [ ] **Step 3: Add explicit failure and dependency states**

Render stable messages for `rdp_client_missing`, `host_backend_missing`, `unsupported_wayland`, `macos_host_phase_2`, `port_in_use`, `permission_missing`, `existing_rdp_service`, and `host_exited`. Do not auto-start compatibility mode after an RDP failure.

- [ ] **Step 4: Run tests, build, and commit**

Run the focused frontend tests and `npm --prefix app run build`. Expected: PASS with no text overflow introduced in the existing remote window.

Commit:

```bash
git add app/src/builtins/remotedesk/App.tsx app/src/builtins/remotedesk/rdpModel.test.ts
git commit -m "feat: make RDP the primary remote desktop mode"
```

## Task 7: Verify Phase 1A And Record Platform Gates

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-cross-platform-rdp-phase-1a.md`
- Verify: `app/src-tauri/src/builtins/remotedesk_rdp.rs`
- Verify: `app/src-tauri/src/builtins/remotedesk.rs`
- Verify: `app/src/builtins/remotedesk/App.tsx`

- [ ] **Step 1: Run the complete automated suite**

```bash
npm --prefix app test
npm --prefix app run build
cargo test --manifest-path app/src-tauri/Cargo.toml
cargo check --manifest-path app/src-tauri/Cargo.toml
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Verify current-machine failure behavior**

On macOS without a bundled FreeRDP host, open the remote desktop window and verify:

- Capability detection reports macOS host as Phase 2.
- The compatibility mode remains available.
- A profile can select `FreeRDP`; when no executable exists the UI reports `RDP 客户端未安装`.
- No host process or public tunnel starts automatically.

- [ ] **Step 3: Run the Windows manual gate before Phase 1B**

On a Windows test host with the exact candidate FreeRDP build:

```text
1. Start DevLauncher RDP host.
2. Connect from mstsc and FreeRDP.
3. Verify current physical desktop, keyboard, mouse, wheel, and clipboard.
4. Stop the host and verify the temporary credential is rejected.
5. Record FreeRDP version, CPU, bandwidth, and observed failures.
```

Pass condition: current-console control works without recurring multi-second stalls. Failure blocks bundling and triggers evaluation of an actively maintained RDP server implementation.

- [ ] **Step 4: Run the Linux manual gates before Phase 1B**

Run the same interaction and credential checks on:

- X11 with `freerdp-shadow-cli`.
- GNOME Wayland with GNOME Remote Desktop remote assistance.

Pass condition: both supported session types control the visible desktop and stop without leaving DevLauncher-created credentials enabled.

- [ ] **Step 5: Mark completed checkboxes and commit verification notes**

Update only checkboxes actually verified and add a short `Verification Results` section containing command results and platform versions. Do not mark Windows/Linux manual gates complete from macOS evidence.

Commit:

```bash
git add docs/superpowers/plans/2026-07-16-cross-platform-rdp-phase-1a.md
git commit -m "docs: record RDP phase 1A verification"
```

## Phase 1B Entry Criteria

Create the packaging plan only after Task 7 records passing Windows and Linux gates. That plan must pin one FreeRDP commit or release, produce target-specific binaries in CI, include Apache-2.0 notices, verify hashes at build time, configure Tauri `externalBin`, sign release artifacts, add explicit frp/ngrok TCP tunneling with a public-exposure warning, and repeat the connection matrix against packaged builds.
