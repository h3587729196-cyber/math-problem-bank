import type { Method, Problem } from "../types";
import { db } from "./idb";
import { buildBackupBlob } from "./backup";
import { backupFileName, rotateBackupNames } from "../utils/backupNames";

const CONFIG_KEY = "mb-local-sync-config";
const LAST_KEY = "mb-local-sync-last";
const ERROR_KEY = "mb-local-sync-error";
const DIR_KEY = "local-backup-dir";

export interface LocalSyncConfig {
  enabled: boolean;
  keepCount: number;
}

export interface LocalBackupResult {
  fileName: string;
  size: number;
  kept: number;
  total: number;
}

export function loadLocalSyncConfig(): LocalSyncConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { enabled: false, keepCount: 10 };
    const cfg = JSON.parse(raw) as Partial<LocalSyncConfig>;
    return {
      enabled: cfg.enabled === true,
      keepCount: Number(cfg.keepCount) || 10,
    };
  } catch {
    return { enabled: false, keepCount: 10 };
  }
}

export function saveLocalSyncConfig(cfg: LocalSyncConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function getLastLocalBackup(): { at: number; name: string } | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as { at: number; name: string };
    return data && data.at ? data : null;
  } catch {
    return null;
  }
}

export function setLastLocalError(message: string): void {
  localStorage.setItem(ERROR_KEY, message);
}

export function getLastLocalError(): string | null {
  return localStorage.getItem(ERROR_KEY);
}

export async function getBackupDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  return (await db.getSetting<FileSystemDirectoryHandle>(DIR_KEY)) ?? null;
}

export async function setBackupDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await db.setSetting(DIR_KEY, handle);
}

export async function clearBackupDirHandle(): Promise<void> {
  await db.removeSetting(DIR_KEY);
}

async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<void> {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (opts: { mode: string }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode: string }) => Promise<PermissionState>;
  };
  const opts = { mode: "readwrite" };
  if (h.queryPermission && (await h.queryPermission(opts)) === "granted") return;
  if (h.requestPermission) {
    const state = await h.requestPermission(opts);
    if (state === "granted") return;
    throw new Error("没有文件夹写入权限，请重新选择备份文件夹");
  }
}

export async function runLocalBackup(
  handle: FileSystemDirectoryHandle,
  _problems: Problem[],
  _methods: Method[],
  keepCount: number,
  onProgress?: (done: number, total: number, label: string) => void
): Promise<LocalBackupResult> {
  await ensureWritePermission(handle);
  const { blob } = await buildBackupBlob(onProgress);
  const fileName = backupFileName();
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writer = await fileHandle.createWritable();
  await writer.write(blob);
  await writer.close();

  const names: string[] = [];
  for await (const entry of handle.values()) {
    if (entry.kind === "file") names.push(entry.name);
  }
  const toRemove = rotateBackupNames(names, keepCount);
  for (const name of toRemove) {
    await handle.removeEntry(name).catch(() => undefined);
  }

  localStorage.setItem(LAST_KEY, JSON.stringify({ at: Date.now(), name: fileName }));
  localStorage.removeItem(ERROR_KEY);
  return {
    fileName,
    size: blob.size,
    kept: names.length - toRemove.length,
    total: names.length,
  };
}
