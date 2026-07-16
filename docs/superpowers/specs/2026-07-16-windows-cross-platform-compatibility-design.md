# Windows Cross-Platform Compatibility Design

## Goal

Keep one shared `main` branch for DevLauncher while making the current macOS-first v0.2.0 code compile, test, and run on Windows without removing macOS behavior.

## Scope

### Change

- Isolate direct Apple-only Rust dependencies behind Cargo target-specific dependency declarations.
- Fix Windows compile or runtime failures revealed by the current locked dependency graph and Tauri startup.
- Add narrowly targeted regression coverage when a platform decision can be tested without platform-specific hardware.
- Document or script Windows build and release commands only when the existing project lacks a reliable entry point.

### Preserve

- macOS OCR, translation, window layering, Control-key monitoring, autostart, and release behavior.
- Existing frontend behavior, plugin APIs, persisted configuration, shortcuts, and action formats.
- The current versioning model and a single shared source tree.

### Defer

- New product features and unrelated refactoring.
- Windows implementations for macOS-only capabilities when the product already exposes them as unsupported.
- CI/CD publication changes unless local Windows validation proves that release configuration itself blocks packaging.

## Architecture

The repository continues to use one `main` branch. Shared Rust and TypeScript code remains platform-neutral, while native differences are isolated with `#[cfg(target_os = "macos")]`, `#[cfg(target_os = "windows")]`, or Cargo target-specific dependency sections. Frontend code consumes platform capability data rather than assuming that a macOS-only command works everywhere.

Direct dependencies used exclusively by Apple framework code (`objc2`, `block2`, `objc2-app-kit`, and `objc2-foundation`) belong under `[target.'cfg(target_os = "macos")'.dependencies]`. Cross-platform dependencies such as Tauri plugins remain in the common dependency section when they support both platforms.

## Validation Flow

1. Install the exact frontend dependencies from `app/package-lock.json`.
2. Run all Vitest tests and the TypeScript/Vite production build.
3. Run locked Rust checks and tests for the Windows host target.
4. Start the Tauri application on Windows and verify that its main window, tray integration, keyboard entry, pet entry, and settings surface initialize without a fatal error.
5. Build a Windows bundle to validate icons, capabilities, resources, and packaging configuration.
6. Re-run UTF-8 validation and inspect the final Git diff.

Failures are handled one at a time. Each fix must preserve the macOS branch and remain limited to the failing platform boundary.

## Release Model

- `main` is the shared integration branch for macOS and Windows.
- A single semantic version tag identifies one source release.
- Platform-specific workflows produce separate artifacts from that tag: macOS DMG/app artifacts and Windows MSI/NSIS artifacts.
- Short-lived `release/*` or `hotfix/*` branches are acceptable for stabilization, but all fixes return to `main`; there are no permanent platform branches.

## Error Handling

Unsupported native capabilities must return an explicit platform-not-supported result or remain disabled through capability data. They must not panic during application startup. Optional integration failures should be visible to the relevant UI while leaving unrelated launcher features usable.

## Acceptance Criteria

- `npm test -- --run` passes in `app`.
- `npm run build` passes in `app`.
- `cargo check --locked` and relevant Rust tests pass on Windows.
- The Tauri application starts on Windows without a fatal initialization error.
- Windows packaging succeeds, or any external packaging prerequisite is reported with exact command output.
- Apple-only direct crates are not compiled for the Windows target.
- No macOS feature or command registration is removed to make Windows pass.
- Source and documentation files remain valid UTF-8 with repository-compliant line endings.

## Self-Review

- No placeholders or deferred implementation details are present.
- The single-branch release model matches the approved direction.
- The dependency boundary preserves macOS behavior while removing the confirmed Windows build blocker.
- Runtime and packaging checks are included, so compile success alone is not treated as completion.
