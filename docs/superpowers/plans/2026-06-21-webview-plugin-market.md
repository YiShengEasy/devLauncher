# Static WebView Plugin Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first DevLauncher plugin market slice: install static WebView plugins from local zip or static marketplace JSON, list them in settings, show enabled plugin actions in launcher search, and open plugin pages in a safe host window.

**Architecture:** Add a Tauri plugin manager that validates manifests, verifies downloads, extracts zip packages into the app data directory, and tracks installed/enabled state. Add frontend plugin types, a plugin registry hook, launcher integration, a plugin center in settings, and a `PluginHostApp` route that asks Tauri for a safe local entry URL before rendering the plugin page.

**Tech Stack:** Tauri 2, Rust, React, TypeScript, Vitest, `serde`, `serde_json`, `ureq`, new Rust crates `sha2` and `zip`.

---

## Scope Check

This plan implements only the approved static WebView plugin market MVP from `docs/superpowers/specs/2026-06-21-webview-plugin-market-design.md`.

It does not implement script execution, third-party ecosystem adaptation, developer upload flows, plugin signing, or converting existing builtins into marketplace packages.

## File Structure

- Create `app/src/plugins/types.ts`: TypeScript plugin manifest, installed plugin, market entry, and `PluginAction` types.
- Create `app/src/plugins/registry.ts`: Pure helpers that convert enabled plugins into launcher records.
- Create `app/src/plugins/api.ts`: Tauri invoke wrappers for plugin manager commands.
- Create `app/src/plugins/PluginHostApp.tsx`: Plugin host route that loads one installed plugin entry.
- Create `app/src/components/PluginCenter.tsx`: Settings plugin center UI.
- Modify `app/src/types/actions.ts`: Add `plugin` action support and metadata.
- Modify `app/src/icons/palette.ts`: Add a plugin icon color token.
- Modify `app/src/icons/actionIcons.tsx`: Add the plugin icon to `ACTION_ICON_COMPONENTS`.
- Modify `app/src/launcher/actionIndex.ts`: Include plugin actions in launcher records.
- Modify `app/src/launcher/actionExecutor.ts`: Execute plugin actions through Tauri.
- Modify `app/src/entry/SearchEntryApp.tsx`: Load installed plugins and merge plugin records.
- Modify `app/src/main.tsx`: Route `entry=plugin-host`.
- Modify `app/src/components/SettingsPanel.tsx`: Add a `plugins` settings section.
- Modify `app/src-tauri/Cargo.toml`: Add `sha2` and `zip`.
- Create `app/src-tauri/src/plugin_manifest.rs`: Rust manifest and validation logic.
- Create `app/src-tauri/src/plugin_manager.rs`: Install/list/enable/disable/uninstall/open plugin commands.
- Modify `app/src-tauri/src/lib.rs`: Register plugin manager module and commands.
- Modify `app/src-tauri/tauri.conf.json`: Add a hidden `plugin-host` window.
- Create `app/src/plugins/registry.test.ts`: Plugin registry tests.
- Modify `app/src/launcher/actionIndex.test.ts`: Plugin launcher indexing tests.
- Modify `app/src/launcher/actionExecutor.test.ts`: Plugin execution tests.
- Add inline `#[cfg(test)]` tests in `app/src-tauri/src/plugin_manifest.rs`.
- Create `examples/plugins/hello-webview/plugin.json` and `examples/plugins/hello-webview/dist/index.html`: A minimal fixture plugin.

## Task 1: TypeScript Plugin Types And Action Model

**Files:**
- Create: `app/src/plugins/types.ts`
- Modify: `app/src/types/actions.ts`
- Modify: `app/src/icons/palette.ts`
- Modify: `app/src/icons/actionIcons.tsx`

- [ ] **Step 1: Add plugin type definitions**

Create `app/src/plugins/types.ts`:

```ts
export type PluginKind = "webview";
export type PluginSource = "local" | "market";

export interface PluginManifestAction {
  id: string;
  title: string;
  type: "webview";
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  description?: string;
  entry: string;
  icon?: string;
  actions: PluginManifestAction[];
}

export interface InstalledPlugin {
  id: string;
  version: string;
  enabled: boolean;
  source: PluginSource;
  installedAt: number;
  manifest: PluginManifest;
}

export interface MarketplacePluginEntry {
  id: string;
  name: string;
  version: string;
  kind: PluginKind;
  description?: string;
  downloadUrl: string;
  sha256: string;
  icon?: string;
}

export interface MarketplaceIndex {
  version: 1;
  plugins: MarketplacePluginEntry[];
}
```

- [ ] **Step 2: Add `plugin` to the shared action model**

Modify `app/src/types/actions.ts`:

```ts
export type ActionType =
  | "app"
  | "folder"
  | "file"
  | "url"
  | "ssh"
  | "script"
  | "system"
  | "builtin"
  | "plugin";

export interface PluginAction extends ActionBase {
  type: "plugin";
  pluginId: string;
  actionId: string;
}

export type Action =
  | AppAction
  | FolderAction
  | FileAction
  | UrlAction
  | SshAction
  | ScriptAction
  | SystemAction
  | BuiltinAction
  | PluginAction;
```

Add metadata:

```ts
plugin: { label: "插件", color: "#a7f3d0", bg: "rgba(20,120,90,0.78)" },
```

- [ ] **Step 3: Add plugin icon mapping**

Modify `app/src/icons/palette.ts`:

```ts
plugin: "#a7f3d0",
```

Modify `app/src/icons/actionIcons.tsx`:

```tsx
export function PluginIcon(props: IconProps) {
  return (
    <IconBase {...withIconColor(props, iconColors.plugin)}>
      <rect x="5" y="5" width="6" height="6" rx="1.6" />
      <rect x="13" y="5" width="6" height="6" rx="1.6" />
      <rect x="5" y="13" width="6" height="6" rx="1.6" />
      <path d="M14 16h5M16.5 13.5v5" />
    </IconBase>
  );
}
```

Add it to `ACTION_ICON_COMPONENTS`:

```ts
plugin: PluginIcon,
```

- [ ] **Step 4: Run TypeScript tests**

Run:

```bash
cd app
npm test -- src/launcher/actionIndex.test.ts src/launcher/actionExecutor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/plugins/types.ts app/src/types/actions.ts app/src/icons/palette.ts app/src/icons/actionIcons.tsx
git commit -m "feat: add webview plugin action types"
```

## Task 2: Plugin Registry And Launcher Records

**Files:**
- Create: `app/src/plugins/registry.ts`
- Create: `app/src/plugins/registry.test.ts`
- Modify: `app/src/launcher/actionIndex.ts`
- Modify: `app/src/launcher/actionIndex.test.ts`

- [ ] **Step 1: Write registry tests**

Create `app/src/plugins/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { InstalledPlugin } from "./types";
import { buildPluginActionRecords } from "./registry";

const plugin: InstalledPlugin = {
  id: "devlauncher.tools.hello",
  version: "1.0.0",
  enabled: true,
  source: "local",
  installedAt: 1782030000000,
  manifest: {
    id: "devlauncher.tools.hello",
    name: "Hello Plugin",
    version: "1.0.0",
    kind: "webview",
    description: "A static test plugin",
    entry: "dist/index.html",
    actions: [{ id: "open", title: "Open Hello", type: "webview" }],
  },
};

describe("plugin registry", () => {
  it("builds launcher records for enabled plugin actions", () => {
    const records = buildPluginActionRecords([plugin]);
    expect(records).toMatchObject([
      {
        id: "plugin:devlauncher.tools.hello:open",
        title: "Open Hello",
        source: "plugin",
        actionKind: "execute-action",
        action: {
          type: "plugin",
          name: "Open Hello",
          pluginId: "devlauncher.tools.hello",
          actionId: "open",
        },
      },
    ]);
  });

  it("does not expose disabled plugins", () => {
    const records = buildPluginActionRecords([{ ...plugin, enabled: false }]);
    expect(records).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement registry helper**

Create `app/src/plugins/registry.ts`:

```ts
import type { LauncherActionRecord } from "@/launcher/actionIndex";
import type { PluginAction } from "@/types/actions";
import type { InstalledPlugin } from "./types";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function unique(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => normalize(value ?? "")).filter(Boolean)));
}

export function buildPluginActionRecords(plugins: InstalledPlugin[]): LauncherActionRecord[] {
  return plugins.flatMap((plugin) => {
    if (!plugin.enabled) return [];
    return plugin.manifest.actions.map((manifestAction) => {
      const action: PluginAction = {
        type: "plugin",
        name: manifestAction.title,
        pluginId: plugin.id,
        actionId: manifestAction.id,
      };
      return {
        id: `plugin:${plugin.id}:${manifestAction.id}`,
        title: manifestAction.title,
        subtitle: plugin.manifest.description ?? plugin.manifest.name,
        source: "plugin" as const,
        actionKind: "execute-action" as const,
        action,
        keywords: unique([
          plugin.id,
          plugin.manifest.name,
          plugin.manifest.description,
          manifestAction.id,
          manifestAction.title,
        ]),
      };
    });
  });
}
```

- [ ] **Step 3: Extend launcher source types and keyword indexing**

Modify `app/src/launcher/actionIndex.ts`:

```ts
export type LauncherActionSource = "keyboard" | "builtin" | "recent" | "plugin";
```

Extend `actionKeywords`:

```ts
if (action.type === "plugin") {
  base.push(action.pluginId, action.actionId);
}
```

- [ ] **Step 4: Add launcher test coverage**

Modify `app/src/launcher/actionIndex.test.ts` with this test:

```ts
it("indexes plugin actions from keyboard bindings", () => {
  const records = buildKeyboardActionRecords({
    pages: [{
      name: "Main",
      keys: {
        A: {
          action: {
            type: "plugin",
            name: "Open Hello",
            pluginId: "devlauncher.tools.hello",
            actionId: "open",
          },
        },
      },
    }],
  });

  expect(records[0]).toMatchObject({
    id: "keyboard:0:A",
    title: "Open Hello",
    source: "keyboard",
    actionKind: "execute-action",
  });
  expect(records[0].keywords).toContain("devlauncher.tools.hello");
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
cd app
npm test -- src/plugins/registry.test.ts src/launcher/actionIndex.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/src/plugins/registry.ts app/src/plugins/registry.test.ts app/src/launcher/actionIndex.ts app/src/launcher/actionIndex.test.ts
git commit -m "feat: index webview plugin actions"
```

## Task 3: Rust Manifest Validation

**Files:**
- Create: `app/src-tauri/src/plugin_manifest.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add manifest module with tests**

Create `app/src-tauri/src/plugin_manifest.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifestAction {
    pub id: String,
    pub title: String,
    #[serde(rename = "type")]
    pub action_type: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: String,
    pub description: Option<String>,
    pub entry: String,
    pub icon: Option<String>,
    pub actions: Vec<PluginManifestAction>,
}

fn is_safe_id(value: &str) -> bool {
    !value.is_empty()
        && value.chars().all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '.' || ch == '-')
}

fn is_relative_safe_path(value: &str) -> bool {
    let path = std::path::Path::new(value);
    !value.trim().is_empty()
        && !path.is_absolute()
        && !path.components().any(|component| matches!(component, std::path::Component::ParentDir))
}

pub fn validate_manifest(manifest: &PluginManifest) -> Result<(), String> {
    if !is_safe_id(&manifest.id) {
        return Err("plugin id must use lowercase letters, digits, dots, or dashes".to_string());
    }
    if manifest.name.trim().is_empty() {
        return Err("plugin name is required".to_string());
    }
    if manifest.version.trim().is_empty() {
        return Err("plugin version is required".to_string());
    }
    if manifest.kind != "webview" {
        return Err("only webview plugins are supported".to_string());
    }
    if !is_relative_safe_path(&manifest.entry) || !manifest.entry.ends_with(".html") {
        return Err("plugin entry must be a relative html file".to_string());
    }
    if manifest.actions.is_empty() {
        return Err("plugin must declare at least one action".to_string());
    }
    for action in &manifest.actions {
        if !is_safe_id(&action.id) {
            return Err("plugin action id must use lowercase letters, digits, dots, or dashes".to_string());
        }
        if action.title.trim().is_empty() {
            return Err("plugin action title is required".to_string());
        }
        if action.action_type != "webview" {
            return Err("only webview plugin actions are supported".to_string());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_manifest() -> PluginManifest {
        PluginManifest {
            id: "devlauncher.tools.hello".to_string(),
            name: "Hello".to_string(),
            version: "1.0.0".to_string(),
            kind: "webview".to_string(),
            description: Some("Hello plugin".to_string()),
            entry: "dist/index.html".to_string(),
            icon: None,
            actions: vec![PluginManifestAction {
                id: "open".to_string(),
                title: "Open Hello".to_string(),
                action_type: "webview".to_string(),
            }],
        }
    }

    #[test]
    fn accepts_valid_webview_manifest() {
        assert!(validate_manifest(&valid_manifest()).is_ok());
    }

    #[test]
    fn rejects_path_traversal_entry() {
        let mut manifest = valid_manifest();
        manifest.entry = "../dist/index.html".to_string();
        assert_eq!(
            validate_manifest(&manifest),
            Err("plugin entry must be a relative html file".to_string())
        );
    }

    #[test]
    fn rejects_non_webview_kind() {
        let mut manifest = valid_manifest();
        manifest.kind = "script".to_string();
        assert_eq!(
            validate_manifest(&manifest),
            Err("only webview plugins are supported".to_string())
        );
    }
}
```

- [ ] **Step 2: Register module**

Modify `app/src-tauri/src/lib.rs`:

```rust
mod plugin_manifest;
```

- [ ] **Step 3: Run Rust tests**

Run:

```bash
cd app/src-tauri
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo test plugin_manifest
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src-tauri/src/plugin_manifest.rs app/src-tauri/src/lib.rs
git commit -m "feat: validate webview plugin manifests"
```

## Task 4: Tauri Plugin Manager Commands

**Files:**
- Modify: `app/src-tauri/Cargo.toml`
- Create: `app/src-tauri/src/plugin_manager.rs`
- Modify: `app/src-tauri/src/lib.rs`

- [ ] **Step 1: Add Rust dependencies**

Modify `app/src-tauri/Cargo.toml`:

```toml
sha2 = "0.10"
zip = "2"
```

- [ ] **Step 2: Implement plugin manager**

Create `app/src-tauri/src/plugin_manager.rs`:

```rust
use crate::plugin_manifest::{validate_manifest, PluginManifest};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Read};
use std::path::{Component, Path, PathBuf};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use zip::ZipArchive;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub id: String,
    pub version: String,
    pub enabled: bool,
    pub source: String,
    pub installed_at: u64,
    pub manifest: PluginManifest,
}

#[derive(Clone, Debug, Deserialize, Serialize, Default)]
struct InstalledPluginsFile {
    plugins: Vec<InstalledPlugin>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplacePluginEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    pub kind: String,
    pub description: Option<String>,
    pub download_url: String,
    pub sha256: String,
    pub icon: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct MarketplaceIndex {
    pub version: u32,
    pub plugins: Vec<MarketplacePluginEntry>,
}

fn plugins_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("plugins"))
}

fn installed_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(plugins_root(app)?.join("installed.json"))
}

fn read_installed_file(app: &tauri::AppHandle) -> Result<InstalledPluginsFile, String> {
    let path = installed_path(app)?;
    if !path.exists() {
        return Ok(InstalledPluginsFile::default());
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_installed_file(app: &tauri::AppHandle, file: &InstalledPluginsFile) -> Result<(), String> {
    let path = installed_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn safe_join(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let path = Path::new(relative);
    if path.is_absolute() {
        return Err("plugin path must be relative".to_string());
    }
    if path.components().any(|component| matches!(component, Component::ParentDir)) {
        return Err("plugin path cannot contain parent traversal".to_string());
    }
    Ok(base.join(path))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn extract_plugin_zip(app: &tauri::AppHandle, bytes: &[u8], source: &str) -> Result<InstalledPlugin, String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|e| e.to_string())?;
    let mut manifest_content = String::new();
    archive
        .by_name("plugin.json")
        .map_err(|_| "plugin.json is required".to_string())?
        .read_to_string(&mut manifest_content)
        .map_err(|e| e.to_string())?;
    let manifest: PluginManifest = serde_json::from_str(&manifest_content).map_err(|e| e.to_string())?;
    validate_manifest(&manifest)?;

    let plugin_dir = plugins_root(app)?.join(&manifest.id).join(&manifest.version);
    if plugin_dir.exists() {
        fs::remove_dir_all(&plugin_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&plugin_dir).map_err(|e| e.to_string())?;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
        if file.is_dir() {
            continue;
        }
        let out_path = safe_join(&plugin_dir, file.name())?;
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out_file = fs::File::create(out_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut file, &mut out_file).map_err(|e| e.to_string())?;
    }

    let entry_path = safe_join(&plugin_dir, &manifest.entry)?;
    if !entry_path.exists() {
        return Err("plugin entry file does not exist".to_string());
    }

    Ok(InstalledPlugin {
        id: manifest.id.clone(),
        version: manifest.version.clone(),
        enabled: true,
        source: source.to_string(),
        installed_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as u64,
        manifest,
    })
}

fn upsert_installed(app: &tauri::AppHandle, plugin: InstalledPlugin) -> Result<InstalledPlugin, String> {
    let mut file = read_installed_file(app)?;
    file.plugins.retain(|item| item.id != plugin.id);
    file.plugins.push(plugin.clone());
    write_installed_file(app, &file)?;
    Ok(plugin)
}

#[tauri::command]
pub fn list_installed_plugins(app: tauri::AppHandle) -> Result<Vec<InstalledPlugin>, String> {
    Ok(read_installed_file(&app)?.plugins)
}

#[tauri::command]
pub fn install_plugin_from_zip(app: tauri::AppHandle, path: String) -> Result<InstalledPlugin, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let plugin = extract_plugin_zip(&app, &bytes, "local")?;
    upsert_installed(&app, plugin)
}

#[tauri::command]
pub fn fetch_marketplace_index(url: String) -> Result<MarketplaceIndex, String> {
    if !url.starts_with("https://") {
        return Err("marketplace url must use https".to_string());
    }
    let content = ureq::get(&url).call().map_err(|e| e.to_string())?.into_string().map_err(|e| e.to_string())?;
    let index: MarketplaceIndex = serde_json::from_str(&content).map_err(|e| e.to_string())?;
    if index.version != 1 {
        return Err("unsupported marketplace index version".to_string());
    }
    Ok(index)
}

#[tauri::command]
pub fn install_plugin_from_market(app: tauri::AppHandle, entry: MarketplacePluginEntry) -> Result<InstalledPlugin, String> {
    if !entry.download_url.starts_with("https://") {
        return Err("plugin download url must use https".to_string());
    }
    let bytes = ureq::get(&entry.download_url).call().map_err(|e| e.to_string())?.into_bytes().map_err(|e| e.to_string())?;
    if sha256_hex(&bytes) != entry.sha256.to_lowercase() {
        return Err("plugin sha256 mismatch".to_string());
    }
    let plugin = extract_plugin_zip(&app, &bytes, "market")?;
    if plugin.id != entry.id || plugin.version != entry.version {
        return Err("market entry does not match plugin manifest".to_string());
    }
    upsert_installed(&app, plugin)
}

#[tauri::command]
pub fn set_plugin_enabled(app: tauri::AppHandle, plugin_id: String, enabled: bool) -> Result<Vec<InstalledPlugin>, String> {
    let mut file = read_installed_file(&app)?;
    let Some(plugin) = file.plugins.iter_mut().find(|item| item.id == plugin_id) else {
        return Err("plugin is not installed".to_string());
    };
    plugin.enabled = enabled;
    write_installed_file(&app, &file)?;
    Ok(file.plugins)
}

#[tauri::command]
pub fn uninstall_plugin(app: tauri::AppHandle, plugin_id: String) -> Result<Vec<InstalledPlugin>, String> {
    let mut file = read_installed_file(&app)?;
    let Some(plugin) = file.plugins.iter().find(|item| item.id == plugin_id).cloned() else {
        return Err("plugin is not installed".to_string());
    };
    let dir = plugins_root(&app)?.join(&plugin.id).join(&plugin.version);
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(|e| e.to_string())?;
    }
    file.plugins.retain(|item| item.id != plugin_id);
    write_installed_file(&app, &file)?;
    Ok(file.plugins)
}

#[tauri::command]
pub fn get_plugin_entry_url(app: tauri::AppHandle, plugin_id: String, action_id: String) -> Result<String, String> {
    let file = read_installed_file(&app)?;
    let Some(plugin) = file.plugins.iter().find(|item| item.id == plugin_id) else {
        return Err("plugin is not installed".to_string());
    };
    if !plugin.enabled {
        return Err("plugin is disabled".to_string());
    }
    if !plugin.manifest.actions.iter().any(|action| action.id == action_id) {
        return Err("plugin action is not declared".to_string());
    }
    let plugin_dir = plugins_root(&app)?.join(&plugin.id).join(&plugin.version);
    let entry = safe_join(&plugin_dir, &plugin.manifest.entry)?;
    if !entry.exists() {
        return Err("plugin entry file does not exist".to_string());
    }
    Ok(entry.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_plugin_window(app: tauri::AppHandle, plugin_id: String, action_id: String) -> Result<(), String> {
    get_plugin_entry_url(app.clone(), plugin_id.clone(), action_id.clone())?;
    let url = format!("index.html?entry=plugin-host&pluginId={}&actionId={}", plugin_id, action_id);
    if let Some(win) = app.get_webview_window("plugin-host") {
        win.eval(&format!("window.location.href = '{}'", url)).map_err(|e| e.to_string())?;
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "plugin-host", WebviewUrl::App(url.into()))
        .title("DevLauncher Plugin")
        .inner_size(860.0, 620.0)
        .resizable(true)
        .decorations(false)
        .visible(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

- [ ] **Step 3: Register module and commands**

Modify `app/src-tauri/src/lib.rs`:

```rust
mod plugin_manager;
```

Add commands to `tauri::generate_handler!`:

```rust
plugin_manager::list_installed_plugins,
plugin_manager::install_plugin_from_zip,
plugin_manager::fetch_marketplace_index,
plugin_manager::install_plugin_from_market,
plugin_manager::set_plugin_enabled,
plugin_manager::uninstall_plugin,
plugin_manager::get_plugin_entry_url,
plugin_manager::open_plugin_window,
```

- [ ] **Step 4: Run Rust checks**

Run:

```bash
cd app/src-tauri
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo check
```

Expected: PASS, allowing existing unused import warnings in `src/utils/icon.rs`.

- [ ] **Step 5: Commit**

```bash
git add app/src-tauri/Cargo.toml app/src-tauri/Cargo.lock app/src-tauri/src/plugin_manager.rs app/src-tauri/src/lib.rs
git commit -m "feat: add static plugin manager commands"
```

## Task 5: Frontend Plugin API And Executor

**Files:**
- Create: `app/src/plugins/api.ts`
- Modify: `app/src/launcher/actionExecutor.ts`
- Modify: `app/src/launcher/actionExecutor.test.ts`

- [ ] **Step 1: Add frontend invoke wrappers**

Create `app/src/plugins/api.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";
import type { InstalledPlugin, MarketplaceIndex, MarketplacePluginEntry } from "./types";

export function listInstalledPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("list_installed_plugins");
}

export function installPluginFromZip(path: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("install_plugin_from_zip", { path });
}

export function fetchMarketplaceIndex(url: string): Promise<MarketplaceIndex> {
  return invoke<MarketplaceIndex>("fetch_marketplace_index", { url });
}

export function installPluginFromMarket(entry: MarketplacePluginEntry): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>("install_plugin_from_market", { entry });
}

export function setPluginEnabled(pluginId: string, enabled: boolean): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("set_plugin_enabled", { pluginId, enabled });
}

export function uninstallPlugin(pluginId: string): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>("uninstall_plugin", { pluginId });
}

export function getPluginEntryUrl(pluginId: string, actionId: string): Promise<string> {
  return invoke<string>("get_plugin_entry_url", { pluginId, actionId });
}
```

- [ ] **Step 2: Add failing executor test**

Modify `app/src/launcher/actionExecutor.test.ts`:

```ts
it("opens plugin actions through the plugin window command", async () => {
  const invoke = vi.fn().mockResolvedValue(undefined);
  await executeAction(
    {
      type: "plugin",
      name: "Open Hello",
      pluginId: "devlauncher.tools.hello",
      actionId: "open",
    },
    { invoke },
  );

  expect(invoke).toHaveBeenCalledWith("open_plugin_window", {
    pluginId: "devlauncher.tools.hello",
    actionId: "open",
  });
});
```

- [ ] **Step 3: Implement executor support**

Modify `app/src/launcher/actionExecutor.ts`:

```ts
if (action.type === "plugin") {
  await deps.invoke("open_plugin_window", {
    pluginId: action.pluginId,
    actionId: action.actionId,
  });
  return;
}
```

Place this branch after the builtin branch and before the generic `execute_action` call.

- [ ] **Step 4: Run executor tests**

Run:

```bash
cd app
npm test -- src/launcher/actionExecutor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/plugins/api.ts app/src/launcher/actionExecutor.ts app/src/launcher/actionExecutor.test.ts
git commit -m "feat: execute webview plugin actions"
```

## Task 6: Search Integration

**Files:**
- Modify: `app/src/entry/SearchEntryApp.tsx`
- Modify: `app/src/entry/SearchPanel.tsx`

- [ ] **Step 1: Load installed plugins in search entry**

Modify `app/src/entry/SearchEntryApp.tsx`:

```ts
import { useEffect, useMemo, useState } from "react";
import { listInstalledPlugins } from "@/plugins/api";
import { buildPluginActionRecords } from "@/plugins/registry";
import type { InstalledPlugin } from "@/plugins/types";
```

Inside `SearchEntryApp`:

```ts
const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);

useEffect(() => {
  listInstalledPlugins()
    .then(setPlugins)
    .catch((error) => {
      console.warn("[DevLauncher] listInstalledPlugins failed:", error);
      setPlugins([]);
    });
}, []);

const pluginRecords = useMemo(() => buildPluginActionRecords(plugins), [plugins]);
```

Add `...pluginRecords` to the records array after builtin records.

- [ ] **Step 2: Add plugin visual fallback in search panel**

Modify `app/src/entry/SearchPanel.tsx` where record icons are selected:

```tsx
if (record.source === "plugin") {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        background: "rgba(16,185,129,0.16)",
        color: "#a7f3d0",
        fontSize: 14,
        fontWeight: 800,
      }}
    >
      P
    </div>
  );
}
```

- [ ] **Step 3: Run search-related tests**

Run:

```bash
cd app
npm test -- src/launcher/actionIndex.test.ts src/launcher/actionExecutor.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/entry/SearchEntryApp.tsx app/src/entry/SearchPanel.tsx
git commit -m "feat: show installed plugins in search"
```

## Task 7: Plugin Host Route

**Files:**
- Create: `app/src/plugins/PluginHostApp.tsx`
- Modify: `app/src/main.tsx`
- Modify: `app/src-tauri/tauri.conf.json`

- [ ] **Step 1: Create host app**

Create `app/src/plugins/PluginHostApp.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { getPluginEntryUrl } from "./api";

export function PluginHostApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const pluginId = params.get("pluginId") ?? "";
  const actionId = params.get("actionId") ?? "";
  const [entryUrl, setEntryUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pluginId || !actionId) {
      setError("缺少插件参数。");
      return;
    }
    getPluginEntryUrl(pluginId, actionId)
      .then((path) => {
        setEntryUrl(`file://${path}`);
        setError("");
      })
      .catch((err) => {
        setError(String(err));
        setEntryUrl("");
      });
  }, [pluginId, actionId]);

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#101622", color: "rgba(255,255,255,0.84)", fontFamily: "system-ui" }}>
        <div style={{ maxWidth: 520, padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>插件无法打开</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.58)" }}>{error}</div>
        </div>
      </div>
    );
  }

  if (!entryUrl) {
    return <div style={{ minHeight: "100vh", background: "#101622" }} />;
  }

  return (
    <iframe
      title={pluginId}
      src={entryUrl}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      style={{ width: "100vw", height: "100vh", border: 0, display: "block", background: "#fff" }}
    />
  );
}
```

- [ ] **Step 2: Route plugin host entry**

Modify `app/src/main.tsx`:

```ts
import { PluginHostApp } from "./plugins/PluginHostApp";
```

Inside `RoutedApp`:

```tsx
if (entry === "plugin-host") return <PluginHostApp />;
```

- [ ] **Step 3: Add hidden plugin-host window**

Modify `app/src-tauri/tauri.conf.json` by adding a window entry:

```json
{
  "label": "plugin-host",
  "url": "index.html?entry=plugin-host",
  "title": "DevLauncher Plugin",
  "width": 860,
  "height": 620,
  "resizable": true,
  "decorations": false,
  "transparent": false,
  "shadow": true,
  "alwaysOnTop": false,
  "center": true,
  "skipTaskbar": false,
  "visible": false
}
```

- [ ] **Step 4: Run build**

Run:

```bash
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/plugins/PluginHostApp.tsx app/src/main.tsx app/src-tauri/tauri.conf.json
git commit -m "feat: add static plugin host window"
```

## Task 8: Plugin Center UI

**Files:**
- Create: `app/src/components/PluginCenter.tsx`
- Modify: `app/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Create plugin center component**

Create `app/src/components/PluginCenter.tsx`:

```tsx
import { useEffect, useState } from "react";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import {
  fetchMarketplaceIndex,
  installPluginFromMarket,
  installPluginFromZip,
  listInstalledPlugins,
  setPluginEnabled,
  uninstallPlugin,
} from "@/plugins/api";
import type { InstalledPlugin, MarketplacePluginEntry } from "@/plugins/types";

const DEFAULT_MARKET_URL = "https://example.com/devlauncher/marketplace.json";

export function PluginCenter() {
  const [marketUrl, setMarketUrl] = useState(DEFAULT_MARKET_URL);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [market, setMarket] = useState<MarketplacePluginEntry[]>([]);
  const [status, setStatus] = useState("");

  async function refreshInstalled() {
    setPlugins(await listInstalledPlugins());
  }

  useEffect(() => {
    refreshInstalled().catch((error) => setStatus(String(error)));
  }, []);

  async function loadMarket() {
    try {
      const index = await fetchMarketplaceIndex(marketUrl.trim());
      setMarket(index.plugins);
      setStatus("市场已刷新。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function installLocalZip() {
    const result = await dialogOpen({
      multiple: false,
      directory: false,
      filters: [{ name: "DevLauncher Plugin", extensions: ["zip"] }],
    });
    if (typeof result !== "string") return;
    try {
      await installPluginFromZip(result);
      await refreshInstalled();
      setStatus("插件已安装。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function installMarket(entry: MarketplacePluginEntry) {
    try {
      await installPluginFromMarket(entry);
      await refreshInstalled();
      setStatus("插件已安装。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function toggle(plugin: InstalledPlugin) {
    try {
      setPlugins(await setPluginEnabled(plugin.id, !plugin.enabled));
      setStatus(plugin.enabled ? "插件已禁用。" : "插件已启用。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  async function remove(plugin: InstalledPlugin) {
    try {
      setPlugins(await uninstallPlugin(plugin.id));
      setStatus("插件已卸载。");
    } catch (error) {
      setStatus(String(error));
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>插件市场</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={marketUrl} onChange={(event) => setMarketUrl(event.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button type="button" onClick={loadMarket}>刷新市场</button>
          <button type="button" onClick={installLocalZip}>本地安装</button>
        </div>
        {market.map((entry) => (
          <div key={entry.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{entry.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{entry.description ?? entry.id}</div>
            </div>
            <button type="button" onClick={() => installMarket(entry)}>安装</button>
          </div>
        ))}
      </section>

      <section style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>已安装</div>
        {plugins.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>暂无插件。</div>}
        {plugins.map((plugin) => (
          <div key={plugin.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{plugin.manifest.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{plugin.id} / {plugin.version}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => toggle(plugin)}>{plugin.enabled ? "禁用" : "启用"}</button>
              <button type="button" onClick={() => remove(plugin)}>卸载</button>
            </div>
          </div>
        ))}
      </section>

      {status && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>{status}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Add settings section**

Modify `app/src/components/SettingsPanel.tsx`:

```ts
import { PluginCenter } from "@/components/PluginCenter";
```

Change:

```ts
type SettingsSection = "appearance" | "webaccounts" | "entries";
```

to:

```ts
type SettingsSection = "appearance" | "webaccounts" | "entries" | "plugins";
```

Add nav entry:

```tsx
["plugins", "插件"]
```

Add content branch:

```tsx
{activeSection === "plugins" && <PluginCenter />}
```

- [ ] **Step 3: Run build**

Run:

```bash
cd app
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/PluginCenter.tsx app/src/components/SettingsPanel.tsx
git commit -m "feat: add plugin center"
```

## Task 9: Example Plugin And End-To-End Verification

**Files:**
- Create: `examples/plugins/hello-webview/plugin.json`
- Create: `examples/plugins/hello-webview/dist/index.html`
- Create: `examples/plugins/hello-webview/README.md`

- [ ] **Step 1: Add example plugin manifest**

Create `examples/plugins/hello-webview/plugin.json`:

```json
{
  "id": "devlauncher.examples.hello",
  "name": "Hello WebView",
  "version": "1.0.0",
  "kind": "webview",
  "description": "A minimal static WebView plugin for DevLauncher.",
  "entry": "dist/index.html",
  "actions": [
    {
      "id": "open",
      "title": "Open Hello WebView",
      "type": "webview"
    }
  ]
}
```

- [ ] **Step 2: Add example HTML**

Create `examples/plugins/hello-webview/dist/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hello WebView</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #101622;
        color: #e8eef8;
      }
      main {
        width: min(520px, calc(100vw - 48px));
        padding: 24px;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 12px;
        background: rgba(255,255,255,0.06);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 24px;
      }
      p {
        margin: 0;
        color: rgba(232,238,248,0.68);
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Hello WebView</h1>
      <p>这个页面来自一个静态 DevLauncher 插件包。</p>
    </main>
  </body>
</html>
```

- [ ] **Step 3: Add README**

Create `examples/plugins/hello-webview/README.md`:

```md
# Hello WebView

Minimal static WebView plugin fixture for testing DevLauncher plugin installation.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
cd app
npm test
npm run build
cd src-tauri
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo test plugin_manifest
RUSTC=/opt/homebrew/opt/rustup/bin/rustc rustup run stable cargo check
cd ../..
git diff --check
```

Expected:

- `npm test`: PASS.
- `npm run build`: PASS.
- `cargo test plugin_manifest`: PASS.
- `cargo check`: PASS, allowing existing unused import warnings in `src/utils/icon.rs`.
- `git diff --check`: no output.

- [ ] **Step 5: Manual smoke test**

Run the app in dev mode:

```bash
cd app
npm run tauri dev
```

Manual steps:

1. Zip `examples/plugins/hello-webview` so `plugin.json` is at the zip root.
2. Open DevLauncher settings.
3. Open the plugin center.
4. Install the local zip.
5. Open search and search `Hello`.
6. Launch `Open Hello WebView`.
7. Confirm the plugin host window shows the example HTML.
8. Disable the plugin and confirm search no longer shows it.
9. Uninstall the plugin and confirm it disappears from installed plugins.

- [ ] **Step 6: Commit**

```bash
git add examples/plugins/hello-webview/plugin.json examples/plugins/hello-webview/dist/index.html examples/plugins/hello-webview/README.md
git commit -m "test: add static webview plugin fixture"
```

## Self-Review

- Spec coverage: Tasks cover plugin package shape, local zip install, remote market install, plugin center, launcher search integration, plugin host, safety checks, error handling, and tests.
- Scope: The plan intentionally excludes scripts, third-party adaptation, developer upload, signing, and bundled-plugin conversion.
- Type consistency: `PluginAction`, `InstalledPlugin`, `MarketplaceIndex`, `open_plugin_window`, and `get_plugin_entry_url` names are consistent across frontend and Tauri tasks.
- Validation: Manifest validation, path traversal rejection, HTTPS-only remote market/download, sha256 verification, disabled-plugin filtering, and plugin action execution are covered.
