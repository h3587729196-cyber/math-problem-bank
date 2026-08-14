const LAST_SYNC_KEY = "mb-bridge-last-sync";

export interface BridgeInfo {
  exists: boolean;
  modified: number | null;
  size: number | null;
}

export async function bridgeInfo(): Promise<BridgeInfo> {
  try {
    const res = await fetch("/api/bridge/info");
    if (!res.ok) return { exists: false, modified: null, size: null };
    return (await res.json()) as BridgeInfo;
  } catch {
    return { exists: false, modified: null, size: null };
  }
}

export async function bridgeDownload(): Promise<Blob> {
  const res = await fetch("/api/bridge/download");
  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`);
  return res.blob();
}

export async function bridgeUpload(blob: Blob): Promise<void> {
  const res = await fetch("/api/bridge/upload", {
    method: "POST",
    body: blob,
  });
  if (!res.ok) throw new Error(`上传失败（HTTP ${res.status}）`);
}

export function getBridgeLastSync(): number {
  return Number(localStorage.getItem(LAST_SYNC_KEY) || 0);
}

export function setBridgeLastSync(t = Date.now()): void {
  localStorage.setItem(LAST_SYNC_KEY, String(t));
}
