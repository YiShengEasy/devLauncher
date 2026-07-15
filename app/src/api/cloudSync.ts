import { invoke } from "@tauri-apps/api/core";

export interface CloudSyncSnapshotMeta {
  id: string;
  schemaVersion: number;
  deviceName?: string | null;
  appVersion?: string | null;
  contentHash: string;
  createdAt: string;
}

export interface CloudSyncStatus {
  baseUrl: string;
  hasSyncKey: boolean;
  latestSnapshot?: CloudSyncSnapshotMeta | null;
}

export interface CloudSyncGeneratedKey {
  id: string;
  syncKey: string;
  label?: string | null;
  status: CloudSyncStatus;
}

export interface CloudSyncRestoreResult {
  snapshot: CloudSyncSnapshotMeta;
  backupPaths: string[];
}

export function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  return invoke<CloudSyncStatus>("sync_get_status");
}

export function generateCloudSyncKey(baseUrl: string, label?: string): Promise<CloudSyncGeneratedKey> {
  return invoke<CloudSyncGeneratedKey>("sync_generate_key", { baseUrl, label });
}

export function saveCloudSyncKey(key: string, baseUrl: string): Promise<CloudSyncStatus> {
  return invoke<CloudSyncStatus>("sync_save_key", { key, baseUrl });
}

export function uploadCloudSyncSnapshot(): Promise<CloudSyncSnapshotMeta> {
  return invoke<CloudSyncSnapshotMeta>("sync_upload_snapshot");
}

export function restoreLatestCloudSyncSnapshot(): Promise<CloudSyncRestoreResult> {
  return invoke<CloudSyncRestoreResult>("sync_restore_latest_snapshot");
}
