# Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first manual cloud backup and restore flow for `keyboard.yaml` and `quickmemory_data.json` using a sync key and PostgreSQL-backed API.

**Architecture:** Add a standalone `sync-api/` Node service for sync-key authentication and immutable snapshot storage. Add a Rust `cloud_sync` module in the Tauri app that reads existing config/data files, stores the sync key in OS credentials, calls the API, and restores snapshots with local backups. Add a Settings UI section that exposes connect, upload, status, and restore actions without handling secrets directly in React beyond the typed command calls.

**Tech Stack:** Tauri v2, Rust, `ureq`, `keyring`, React, TypeScript, Vitest, Node.js HTTP server, `pg`, PostgreSQL, Podman-compatible Containerfile.

---

## File Structure

- Create `sync-api/package.json`: Node service scripts and dependencies.
- Create `sync-api/src/server.mjs`: HTTP API, sync-key hashing, snapshot routes, health route.
- Create `sync-api/schema.sql`: PostgreSQL schema for `sync_keys` and `sync_snapshots`.
- Create `sync-api/Containerfile`: Podman/Docker runtime image.
- Create `sync-api/README.md`: local run and deployment notes.
- Modify `app/src-tauri/src/config.rs`: expose path/read/write helpers for cloud sync.
- Modify `app/src-tauri/src/builtins/quickmemory.rs`: expose path/read/write helpers for cloud sync.
- Create `app/src-tauri/src/cloud_sync.rs`: sync settings, credential storage, snapshot assembly, API calls, backup and restore.
- Modify `app/src-tauri/src/lib.rs`: register module and Tauri commands.
- Modify `app/src-tauri/capabilities/default.json`: allow new sync commands.
- Create `app/src/api/cloudSync.ts`: typed frontend wrappers.
- Modify `app/src/components/SettingsPanel.tsx`: add Cloud Sync section.

## Task 1: Sync API Service

**Files:**
- Create: `sync-api/package.json`
- Create: `sync-api/src/server.mjs`
- Create: `sync-api/schema.sql`
- Create: `sync-api/Containerfile`
- Create: `sync-api/README.md`

- [x] **Step 1: Create the Node package**

Create `sync-api/package.json`:

```json
{
  "name": "devlauncher-sync-api",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.mjs"
  },
  "dependencies": {
    "pg": "^8.16.3"
  }
}
```

- [x] **Step 2: Add PostgreSQL schema**

Create `sync-api/schema.sql` with the two required tables, a latest-snapshot index, and a development helper view:

```sql
create table if not exists sync_keys (
  id uuid primary key,
  key_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists sync_snapshots (
  id uuid primary key,
  sync_key_id uuid not null references sync_keys(id) on delete cascade,
  device_name text,
  app_version text,
  schema_version integer not null,
  content_hash text not null,
  keyboard_config jsonb not null,
  quickmemory_data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists sync_snapshots_key_created_idx
  on sync_snapshots(sync_key_id, created_at desc);
```

- [x] **Step 3: Implement the HTTP API**

Create `sync-api/src/server.mjs` with:

- `GET /healthz`
- `POST /api/sync/keys`
- `GET /api/sync/status`
- `POST /api/sync/snapshots`
- `GET /api/sync/snapshots/latest`

The server must hash sync keys with `crypto.scrypt`, authenticate with `Authorization: Bearer <key>`, cap JSON bodies at 2 MB, and never log request bodies or raw keys.

- [x] **Step 4: Add container and README**

Create `sync-api/Containerfile` using `node:22-alpine`, copy package files, run `npm install --omit=dev`, copy `src`, and expose `8787`.

Create `sync-api/README.md` with local environment variables:

```bash
DATABASE_URL=postgres://devlauncher:devlauncher@127.0.0.1:5432/devlauncher_sync
SYNC_API_PORT=8787
```

## Task 2: Rust Cloud Sync Core

**Files:**
- Modify: `app/src-tauri/src/config.rs`
- Modify: `app/src-tauri/src/builtins/quickmemory.rs`
- Create: `app/src-tauri/src/cloud_sync.rs`
- Modify: `app/src-tauri/src/lib.rs`
- Modify: `app/src-tauri/capabilities/default.json`

- [x] **Step 1: Expose existing file helpers**

Expose read/write helpers for `KeyboardConfig` and `QuickMemoryData` so cloud sync reuses the same serialization paths as the rest of the app.

- [x] **Step 2: Add cloud sync settings and credentials**

Create `cloud_sync.rs` with:

- `sync_settings_path(app)`
- `load_sync_settings(app)`
- `save_sync_settings(app, base_url)`
- `save_sync_key(key)`
- `load_sync_key()`
- `sync_get_status(app)`

Persist `base_url` as JSON under app data and the sync key through the existing OS credential pattern.

- [x] **Step 3: Add upload**

Implement `sync_upload_snapshot(app)`:

- read local config/data
- assemble schema version 1 payload
- calculate content hash
- POST to `/api/sync/snapshots`
- return snapshot metadata

- [x] **Step 4: Add restore**

Implement `sync_restore_latest_snapshot(app)`:

- GET latest snapshot
- validate schema version and payload shape
- create timestamped `.bak-<timestamp>` backups for existing local files
- write restored config/data through the exposed helpers
- return snapshot metadata plus backup paths

- [x] **Step 5: Register commands**

Register:

- `cloud_sync::sync_get_status`
- `cloud_sync::sync_save_key`
- `cloud_sync::sync_upload_snapshot`
- `cloud_sync::sync_restore_latest_snapshot`

Allow them in `app/src-tauri/capabilities/default.json`.

## Task 3: Settings UI

**Files:**
- Create: `app/src/api/cloudSync.ts`
- Modify: `app/src/components/SettingsPanel.tsx`

- [x] **Step 1: Add typed API wrappers**

Create `cloudSync.ts` with exported functions:

- `getCloudSyncStatus()`
- `saveCloudSyncKey(key, baseUrl)`
- `uploadCloudSyncSnapshot()`
- `restoreLatestCloudSyncSnapshot()`

- [x] **Step 2: Add Cloud Sync state to settings**

Add local state for base URL, sync key input, status message, loading action, latest snapshot metadata, and restore result.

- [x] **Step 3: Render Cloud Sync section**

Add a Settings section with:

- base URL input
- sync key password input
- save key button
- upload button
- restore button with `window.confirm`
- last snapshot metadata
- warning that real passwords are not synced

## Task 4: Verification

**Files:**
- Test: `app/src-tauri/src/cloud_sync.rs`
- Test: `app/src/components/SettingsPanel.tsx` by build coverage

- [x] **Step 1: Run frontend tests**

Run:

```bash
cd app
npm run test
```

Expected: existing Vitest suite passes.

- [x] **Step 2: Run frontend build**

Run:

```bash
cd app
npm run build
```

Expected: TypeScript and Vite build pass.

- [x] **Step 3: Run Rust check**

Run:

```bash
cargo check --manifest-path app/src-tauri/Cargo.toml
```

Expected: Rust check passes, allowing existing warnings unrelated to cloud sync.

- [x] **Step 4: Check git scope**

Run:

```bash
git status --short
```

Expected: cloud sync files are changed, and previously existing autostart changes remain visible but are not accidentally staged unless the user asks.
