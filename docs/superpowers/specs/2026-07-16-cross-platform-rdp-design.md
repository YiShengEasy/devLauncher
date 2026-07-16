# Cross-Platform RDP Remote Desktop Design

## Summary

DevLauncher will replace its JPEG-over-WebSocket remote desktop path as the default with a standards-compatible RDP path based on FreeRDP and platform host adapters. The default session semantics are to view and control the physical desktop that is already visible on the host. Standard clients such as mstsc, Windows App, Remmina, and FreeRDP must be able to connect directly.

The existing WebSocket implementation remains available as an explicitly selected compatibility mode. It is not an automatic fallback for public connections.

## Goals

- Make RDP the default remote desktop protocol.
- Control the host's currently visible desktop by default.
- Support Windows and Linux hosts in the first implementation phase.
- Add macOS host support in a second phase after validating the FreeRDP Mac Shadow backend.
- Allow both DevLauncher and standard RDP clients to connect.
- Preserve the existing remote desktop page structure and visual language.
- Improve interaction latency compared with full-frame JPEG delivery.
- Use temporary credentials, TLS, and NLA where the selected backend supports them.

## Non-Goals

- Embedding the FreeRDP renderer inside the Tauri webview in the first phase.
- Supporting independent multi-user desktop sessions as the default behavior.
- Automatically exposing an RDP host to the public internet.
- Removing the existing WebSocket compatibility mode in this change.
- Implementing a new account or cloud device-discovery service.

## Current State

The current host captures the primary screen every 50 milliseconds, downsizes only displays wider than 1920 pixels, encodes each frame as a complete JPEG at quality 70, and broadcasts it over WebSocket. The viewer decodes each JPEG and draws it into a canvas. Mouse and keyboard events travel back as JSON messages.

The remote desktop module also stores RDP connection profiles, but `launch_rdp` only launches `mstsc` on Windows. Host management, connection profiles, JPEG transport, frp, ngrok, and the viewer are currently coupled in the same backend and frontend modules.

## Approaches Considered

### 1. FreeRDP Sidecar With Platform Adapters

DevLauncher manages configuration, credentials, process lifecycle, platform detection, and UI state. FreeRDP or the platform RDP service supplies the actual client and host protocol implementation.

This is the selected approach because it offers standard-client compatibility and the shortest path to a measurable improvement while keeping the protocol engine isolated behind a stable interface.

### 2. Deep FreeRDP Library Integration

DevLauncher links the FreeRDP C libraries directly and forwards decoded surfaces and input through an FFI layer into the Tauri application.

This gives the best eventual in-app experience, but it adds cross-platform native build, memory ownership, rendering, and event-loop risk. The architecture will leave room for this later without making it a first-phase requirement.

### 3. RDP-to-WebSocket Gateway

The host exposes RDP while the DevLauncher viewer continues using JPEG-over-WebSocket through a gateway.

This preserves the main performance bottleneck and introduces another translation layer, so it is rejected.

## Architecture

The remote desktop feature will be split into four responsibilities:

```text
RemoteDesk UI
    |
    +-- RdpProfileService
    |     stores endpoints and client preferences
    |
    +-- RdpClientLauncher
    |     selects and launches an installed or bundled RDP client
    |
    +-- RdpHostService
    |     owns credentials, certificates, ports, and process lifecycle
    |
    `-- RdpHostAdapter
          +-- WindowsShadowAdapter
          +-- LinuxX11ShadowAdapter
          +-- LinuxGnomeAdapter
          `-- MacShadowAdapter (phase 2)
```

Rust-facing interfaces will return structured capability and status data instead of platform-specific command output. The UI must not infer support from the operating-system name alone.

### Host Capability Model

The host service reports:

- Operating system and desktop type.
- Selected adapter and alternative adapters.
- Whether current-desktop viewing and interaction are available.
- Whether TLS, NLA, clipboard, audio, and monitor selection are available.
- Required permissions or missing dependencies.
- Running state, endpoint, connection count, and last failure.

### Platform Selection

#### Windows

Use the FreeRDP Windows Shadow subsystem so the connection controls the current physical desktop. The adapter owns the sidecar process, temporary SAM file, certificate material, and command arguments.

#### Linux X11

Use the FreeRDP X11 Shadow subsystem. It shares the active X display and injects input through the X11 backend. The adapter verifies `DISPLAY`, XTest availability, and permissions before starting.

#### Linux Wayland

Prefer GNOME Remote Desktop in remote-assistance mode when the active session is GNOME. It uses RDP while sharing the current session. DevLauncher detects the service and configuration tooling before offering the adapter.

Unsupported Wayland compositors return a clear unsupported-backend result instead of silently starting an independent session. The compatibility mode remains available when its own capture and input permissions work.

#### macOS, Phase 2

Validate the FreeRDP Mac Shadow subsystem on supported macOS versions and both Apple Silicon and Intel where practical. Its existing CoreGraphics capture and input backend is the initial candidate. If capture performance or operating-system compatibility is inadequate, replace only the platform capture backend with ScreenCaptureKit while retaining the FreeRDP server and protocol layers.

Screen Recording and Accessibility permissions remain explicit prerequisites.

## Client Selection

Each profile has a client preference:

- `auto`: select the best available client for the current operating system.
- `system`: use mstsc or another registered system RDP client.
- `freerdp`: use the bundled or configured FreeRDP executable.

The first phase opens a native RDP viewer window. The existing React canvas viewer is used only by compatibility mode. A future embedded client can implement the same launcher/service contract without changing stored profiles or host adapters.

Credentials remain in the operating-system keyring. Command-line passwords are avoided when the selected client offers a credential file, standard input, keychain, or native credential manager path.

## Host Start Flow

1. Detect platform, desktop session, available adapters, and permissions.
2. Select the best adapter for current-desktop control.
3. Select an available port, defaulting to 3389 only when it is free and appropriate.
4. Generate a session-scoped username, strong random password, and TLS certificate as required.
5. Write restricted temporary authentication material when required by the adapter.
6. Start the sidecar or platform service and wait for an explicit readiness probe.
7. Return the endpoint, adapter, security capabilities, and one-time credentials to the UI.
8. Track connections and process exit without parsing localized display strings.

Starting a host twice first stops and cleans up the previous managed host. DevLauncher never terminates an RDP service it did not start unless the user explicitly requests takeover.

## Host Stop Flow

1. Stop accepting new connections.
2. Terminate the managed sidecar or revert the managed platform-service session.
3. Remove temporary SAM, certificate, and credential files.
4. Clear plaintext credentials from process memory where practical.
5. Preserve only non-secret diagnostics and profile preferences.

Previously issued credentials must not authenticate after shutdown or restart.

## Authentication And Network Security

- Use TLS and NLA when supported by the selected host adapter.
- Do not use the existing six-digit PIN as an RDP password.
- Generate a high-entropy session password and rotate it every time the host starts.
- Keep generated secrets out of profile JSON, logs, frontend telemetry, and command output.
- Store temporary files with owner-only permissions and delete them during normal stop and startup recovery.
- Default to LAN access. Public access is an explicit secondary action.
- Public tunneling uses TCP forwarding rather than the current HTTP/WebSocket tunnel assumptions.
- Warn before exposing an RDP listener publicly, even when TLS and NLA are active.
- Limit the first phase to one interactive controller. Additional clients are rejected or view-only when the adapter supports that distinction.

## UI Design

The existing remote desktop layout, typography, colors, control density, and tab structure remain unchanged unless a new state requires an additional row or selector.

### Host Tab

Add compact status rows for:

- Protocol and selected host backend.
- Current desktop type.
- TLS/NLA state.
- Endpoint and one-time username/password.
- Permission or dependency requirements.

The primary action remains the existing start/stop host control. Public tunnel controls remain secondary and are disabled until the RDP listener is ready.

### Connection Profiles

Add a compact client selector with `auto`, `system`, and `FreeRDP` options. Existing host, port, username, password, edit, and delete behavior remains recognizable.

### Compatibility Mode

Label the current JPEG/WebSocket Host and Connect workflow as compatibility mode. It remains user-selectable but is no longer presented as the recommended path.

## Error Handling

All backend errors map to stable error codes plus user-facing Chinese messages. Required cases include:

- RDP client missing.
- Host backend missing.
- Unsupported Wayland compositor.
- Screen capture or input permission missing.
- Port already in use.
- Certificate or credential generation failure.
- Host process exited before readiness.
- Authentication rejected.
- Tunnel executable missing or TCP tunnel startup failure.

Diagnostics include the adapter name, executable version, exit status, and a redacted stderr tail. Secrets and complete command lines containing secret locations are not logged.

## Packaging And Licensing

FreeRDP is Apache-2.0 and may be bundled subject to its license and attribution requirements. Release packaging must include the matching FreeRDP runtime libraries, license notices, and platform-specific sidecar executables.

The build pins a tested FreeRDP version instead of resolving the latest version at runtime. Platform packages are produced by CI or a documented reproducible build process. The application verifies the sidecar version before use and reports a clear mismatch.

GNOME Remote Desktop is treated as an external system component and is not bundled into DevLauncher.

## Migration

- Preserve existing RDP profile data and keyring entries.
- Add optional fields with defaults so older profiles load without migration failures.
- Rename existing Host/Connect implementation internally to compatibility transport without changing stored compatibility settings.
- Do not automatically enable, disable, or replace an existing system RDP service.
- Do not automatically expose existing hosts through frp or ngrok after upgrading.

## Verification

### Automated Tests

- Adapter selection for Windows, Linux X11, Linux GNOME Wayland, unsupported Wayland, and macOS phase gating.
- Executable discovery and version parsing.
- Safe argument construction without plaintext secrets.
- Credential generation, file permissions, rotation, and cleanup.
- Port selection and occupied-port handling.
- Host state transitions and unexpected process exit.
- Profile backward compatibility and client selection.
- Error-code mapping and diagnostic redaction.

### Integration Tests

- Start each available host adapter on a loopback or isolated test endpoint.
- Connect with FreeRDP and verify authentication and disconnect behavior.
- Confirm that credentials from a stopped host are rejected.
- Confirm mouse, keyboard, wheel, clipboard, and resize behavior where supported.
- Confirm public tunnel commands use TCP forwarding and stop cleanly.

### Manual Matrix

- Windows current desktop with mstsc and FreeRDP.
- Linux X11 current desktop with Remmina and FreeRDP.
- GNOME Wayland current desktop with at least one FreeRDP-based client.
- Windows App from macOS against Windows and Linux hosts where available.
- macOS Shadow host matrix in phase 2.

## Performance Acceptance

- Local-network input should feel responsive during normal desktop work and show no recurring multi-second stalls.
- The RDP path must not perform full-screen JPEG encoding every 50 milliseconds.
- Under constrained bandwidth, stale visual updates may be dropped without delaying input events.
- CPU use and outbound bandwidth must be recorded for the existing compatibility path and the RDP path under the same desktop workload before making RDP the release default.

The initial release decision is based on measured improvement rather than a fixed FPS target because RDP sends content-dependent updates rather than complete frames.

## Delivery Phases

### Phase 1: Windows And Linux

- Introduce service and adapter boundaries.
- Package or discover the FreeRDP client.
- Package and manage FreeRDP Shadow for Windows and Linux X11.
- Integrate GNOME Remote Desktop detection and lifecycle for supported Wayland sessions.
- Add secure session credentials and TCP tunnel support.
- Preserve and relabel compatibility mode.
- Complete the Windows/Linux verification matrix.

### Phase 2: macOS Host

- Build and validate the FreeRDP Mac Shadow backend.
- Complete permission onboarding and signed-app runtime verification.
- Replace legacy capture internals with ScreenCaptureKit only if measurements require it.
- Complete the macOS host verification matrix.

### Future: Embedded Viewer

- Link FreeRDP through a native bridge.
- Render decoded surfaces inside the existing DevLauncher remote viewer.
- Preserve the profile, adapter, authentication, and lifecycle contracts defined here.

## Acceptance Criteria

- Windows and supported Linux environments control the current visible desktop over RDP.
- Standard RDP clients can connect using credentials displayed by DevLauncher.
- DevLauncher can launch an RDP client from an existing or newly created profile.
- Keyboard, mouse, wheel, clipboard, and resolution behavior pass the applicable platform matrix.
- Host shutdown invalidates session credentials and removes temporary secret material.
- Missing dependencies, unsupported desktops, occupied ports, and missing permissions produce actionable errors.
- RDP demonstrates a measurable latency and resource-use improvement over compatibility mode on the same LAN test.
- Existing profiles and compatibility mode continue to work after migration.
