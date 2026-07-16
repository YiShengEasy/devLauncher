# Windows Cross-Platform Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the macOS-first DevLauncher v0.2.0 source compile, test, start, and package on Windows while preserving all macOS-native behavior in the shared `main` branch.

**Architecture:** Keep shared frontend and Tauri code in one source tree. Put Apple framework crates in a macOS-only Cargo dependency section, retain the existing `#[cfg]` implementation boundaries, and validate Windows from dependency resolution through a packaged bundle.

**Tech Stack:** Rust 2021, Cargo, Tauri 2, React 19, TypeScript 5.8, Vite 7, Vitest 3, PowerShell.

---

## File Structure

- Modify `app/src-tauri/Cargo.toml`: move direct Apple-only crates from common dependencies to the macOS target dependency table.
- Modify `app/src-tauri/src/lib.rs` only if Windows compilation reports the known callback binding warning as an error or lint blocker; preserve the macOS reopen handler.
- Modify additional files only when an exact Windows compiler, startup, or bundler error names them; update this plan with the concrete error and patch before that edit.

### Task 1: Isolate Apple Framework Dependencies

**Files:**
- Modify: `app/src-tauri/Cargo.toml`

- [x] **Step 1: Record the failing Windows check**

Run:

```powershell
Set-Location app/src-tauri
cargo check --locked
```

Expected before the fix: FAIL in `objc2` with ``objc2 only works on Apple platforms``.

- [x] **Step 2: Move the four direct Apple-only crates**

Remove these entries from `[dependencies]`:

```toml
objc2 = "0.6.4"
block2 = "0.6.2"
objc2-app-kit = { version = "0.3.2", default-features = false, features = ["NSEvent", "NSWindow", "block2"] }
objc2-foundation = { version = "0.3.2", default-features = false, features = ["NSArray", "NSData", "NSDictionary", "NSError", "NSGeometry", "NSObject", "NSString", "std"] }
```

Append this target-specific table after the common dependency list:

```toml
[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.6.4"
block2 = "0.6.2"
objc2-app-kit = { version = "0.3.2", default-features = false, features = ["NSEvent", "NSWindow", "block2"] }
objc2-foundation = { version = "0.3.2", default-features = false, features = ["NSArray", "NSData", "NSDictionary", "NSError", "NSGeometry", "NSObject", "NSString", "std"] }
```

- [x] **Step 3: Verify Windows dependency resolution and compilation**

Run:

```powershell
Set-Location app/src-tauri
cargo check --locked
```

Expected: Cargo no longer compiles the direct `objc2` dependency for the Windows host and reaches `Finished dev profile`.

- [x] **Step 4: Run Rust unit tests**

Run:

```powershell
Set-Location app/src-tauri
cargo test --locked
```

Expected: all Rust unit tests pass.

### Task 2: Revalidate the Shared Frontend

**Files:**
- Test only: `app/src/**/*.test.ts`
- Test only: `app/src/**/*.test.tsx`

- [x] **Step 1: Run the frontend test suite**

Run:

```powershell
Set-Location app
npm test -- --run
```

Expected: 14 test files and 73 tests pass.

- [x] **Step 2: Build production frontend assets**

Run:

```powershell
Set-Location app
npm run build
```

Expected: TypeScript succeeds and Vite writes `app/dist`.

### Task 3: Verify Windows Tauri Startup

**Files:**
- Test only: `app/src-tauri/tauri.conf.json`
- Test only: `app/src-tauri/capabilities/default.json`

- [x] **Step 1: Start the Windows development application**

Run:

```powershell
Set-Location app
npm run tauri -- dev
```

Expected: Vite starts, the Rust application reaches its running state, and no fatal initialization error is printed.

- [ ] **Step 2: Verify visible startup surfaces**

Confirm on Windows that the tray icon appears and the pet/main launcher window can be shown. Exercise the settings panel, keyboard entry shortcut, pet shortcut, and one ordinary launcher action. Expected: each surface opens without terminating the process; macOS-only permission controls remain unsupported or disabled rather than crashing.

Observed: the process remained running and exposed `DevLauncher`, `DevLauncher Pet`, and the debug console windows. Accessibility inspection found the main Keyboard and Settings controls and the pet quick-entry control. Automated clicks were stopped because live user input was detected in the same window, so shortcut and action interaction remain a manual smoke check.

### Task 4: Build the Windows Release Bundle

**Files:**
- Test only: `app/src-tauri/tauri.conf.json`
- Test only: `app/src-tauri/icons/icon.ico`

- [x] **Step 1: Build Windows bundles from the shared source**

Run:

```powershell
Set-Location app
npm run tauri -- build
```

Expected: the release binary compiles and Tauri produces configured Windows installer artifacts beneath `app/src-tauri/target/release/bundle`.

Observed: the release binary compiled successfully. The default `all` target reached WiX but this machine's Windows Installer service rejected ICE validation with `LGHT0217` and `LGHT0216`. The platform-specific command `npm run tauri -- build --bundles nsis` completed successfully and produced the supported Windows installer.

- [x] **Step 2: Inspect generated artifacts**

Run:

```powershell
Get-ChildItem -Recurse app/src-tauri/target/release/bundle | Select-Object FullName, Length
```

Expected: at least one non-empty Windows installer artifact is listed.

### Task 5: Repository Validation and Commit

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-windows-cross-platform-compatibility.md` only to mark completed checkboxes and record exact deviations.

- [x] **Step 1: Validate text encoding**

Run:

```powershell
.\scripts\check-utf8.ps1
```

Expected: the script reports no invalid UTF-8 files.

- [x] **Step 2: Inspect scope and whitespace**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only the approved plan and Windows compatibility files are modified.

- [x] **Step 3: Commit the compatibility change**

Run:

```powershell
git add app/src-tauri/Cargo.toml docs/superpowers/plans/2026-07-16-windows-cross-platform-compatibility.md
git commit -m "fix: restore Windows compatibility"
```

Expected: one commit records the minimal platform dependency fix and completed validation plan.

## Self-Review

- The confirmed `objc2` Windows failure maps directly to Task 1.
- Frontend, Rust, runtime, packaging, encoding, and diff verification are covered.
- macOS-only code and command registrations remain intact.
- Dependency names and feature lists match the current `Cargo.toml` exactly.
- No speculative feature or unrelated refactor is included.
