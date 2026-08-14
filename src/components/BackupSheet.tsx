import { useEffect, useRef, useState } from "react";
import type { Method, Problem } from "../types";
import { formatDateTime } from "../utils/format";
import {
  clearBackupDirHandle,
  getBackupDirHandle,
  getLastLocalBackup,
  getLastLocalError,
  loadLocalSyncConfig,
  runLocalBackup,
  saveLocalSyncConfig,
  setBackupDirHandle,
} from "../db/localSync";
import {
  bridgeDownload,
  bridgeInfo,
  bridgeUpload,
  getBridgeLastSync,
  setBridgeLastSync,
  type BridgeInfo,
} from "../db/bridge";
import { buildBackupBlob } from "../db/backup";
import type { BackupSettings } from "../db/settings";
import { Sheet } from "./ui/Sheet";
import { Segmented } from "./ui/Segmented";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Archive, Cloud, Download, Trash, Upload } from "./ui/icons";

export interface BackupPreview {
  problems: Problem[];
  methods: Method[];
  overlapProblems: number;
  overlapMethods: number;
  totalImages: number;
  settings?: BackupSettings;
}

interface BackupSheetProps {
  open: boolean;
  onClose: () => void;
  problems: Problem[];
  methods: Method[];
  onExport: (
    onProgress: (done: number, total: number, label: string) => void
  ) => Promise<string>;
  onParse: (
    file: File,
    onProgress: (done: number, total: number, label: string) => void
  ) => Promise<BackupPreview>;
  onImport: (
    problems: Problem[],
    methods: Method[],
    onProgress: (done: number, total: number, label: string) => void,
    replace?: boolean,
    settings?: BackupSettings
  ) => Promise<string>;
  onClearAll: () => Promise<string>;
}

type Phase = "idle" | "exporting" | "parsing" | "preview" | "importing";

export function BackupSheet({
  open,
  onClose,
  problems,
  methods,
  onExport,
  onParse,
  onImport,
  onClearAll,
}: BackupSheetProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    label: string;
  } | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [dirName, setDirName] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [keepCount, setKeepCount] = useState(10);
  const [lastBackup, setLastBackup] = useState<{ at: number; name: string } | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localMessage, setLocalMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [bridgeInfoState, setBridgeInfoState] = useState<BridgeInfo | null>(null);
  const [bridgeLastSync, setBridgeLastSyncState] = useState(0);
  const [bridgePending, setBridgePending] = useState(false);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeMessage, setBridgeMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [confirmClear, setConfirmClear] = useState(false);
  const latestRef = useRef({ problems, methods });

  useEffect(() => {
    latestRef.current = { problems, methods };
  }, [problems, methods]);

  useEffect(() => {
    if (!open) return;
    const cfg = loadLocalSyncConfig();
    setEnabled(cfg.enabled);
    setKeepCount(cfg.keepCount);
    setLastBackup(getLastLocalBackup());
    setLocalError(getLastLocalError());
    setLocalMessage(null);
    setBridgeMessage(null);
    setBridgePending(false);
    setBridgeLastSyncState(getBridgeLastSync());
    void bridgeInfo().then((i) => setBridgeInfoState(i));
    void getBackupDirHandle().then((h) => setDirName(h?.name ?? null));
  }, [open]);

  const reset = () => {
    setPhase("idle");
    setProgress(null);
    setPreview(null);
    setImportMode("merge");
  };

  const reportProgress = (done: number, total: number, label: string) =>
    setProgress({ done, total, label });

  const runExport = async () => {
    setMessage(null);
    setPreview(null);
    setPhase("exporting");
    setProgress({ done: 0, total: 1, label: "正在准备…" });
    try {
      const text = await onExport(reportProgress);
      setMessage({ ok: true, text });
      reset();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message || "导出失败" });
      reset();
    }
  };

  const handleFile = async (file: File) => {
    setMessage(null);
    setPhase("parsing");
    setProgress({ done: 0, total: 1, label: "正在读取备份…" });
    try {
      const result = await onParse(file, reportProgress);
      setPreview(result);
      setPhase("preview");
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message || "读取备份失败" });
      reset();
    }
  };

  const runImport = async () => {
    if (!preview) return;
    setPhase("importing");
    setProgress({ done: 0, total: 1, label: "正在写入…" });
    try {
      const text = await onImport(
        preview.problems,
        preview.methods,
        reportProgress,
        importMode === "replace",
        preview.settings
      );
      if (bridgePending) {
        const { blob } = await buildBackupBlob(reportProgress);
        await bridgeUpload(blob);
        setBridgeLastSync();
        setBridgeLastSyncState(getBridgeLastSync());
        setBridgePending(false);
        setBridgeMessage({ ok: true, text: "已同步给其他设备（手机/电脑）。" });
        setMessage({ ok: true, text: `${text} 已同步给其他设备。` });
      } else {
        setMessage({ ok: true, text });
      }
      reset();
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message || "导入失败" });
      reset();
    }
  };

  const chooseDir = async () => {
    setLocalMessage(null);
    setLocalBusy(true);
    try {
      const picker = (window as Window & { showDirectoryPicker?: unknown })
        .showDirectoryPicker;
      if (typeof picker !== "function") {
        throw new Error("当前浏览器不支持选择文件夹，请使用 Chrome 或 Edge");
      }
      const handle = (await (
        picker as (opts: { mode: string }) => Promise<FileSystemDirectoryHandle>
      ).call(window, { mode: "readwrite" })) as FileSystemDirectoryHandle;
      await setBackupDirHandle(handle);
      const cfg = loadLocalSyncConfig();
      saveLocalSyncConfig({ ...cfg, enabled: true, keepCount });
      setDirName(handle.name);
      setEnabled(true);
      setLocalError(null);
      setLocalMessage({ ok: true, text: `已选择文件夹「${handle.name}」，自动备份已开启。` });
    } catch (e) {
      setLocalMessage({
        ok: false,
        text: (e as Error).message || "选择文件夹失败",
      });
    } finally {
      setLocalBusy(false);
    }
  };

  const backupNow = async () => {
    const handle = await getBackupDirHandle();
    if (!handle) {
      setLocalMessage({ ok: false, text: "请先选择备份文件夹。" });
      return;
    }
    setLocalMessage(null);
    setLocalBusy(true);
    try {
      const res = await runLocalBackup(handle, problems, methods, keepCount, reportProgress);
      setLastBackup(getLastLocalBackup());
      setLocalError(null);
      setLocalMessage({
        ok: true,
        text: `已备份：${res.fileName}（文件夹里保留 ${res.kept} 份）`,
      });
    } catch (e) {
      const msg = (e as Error).message || "备份失败";
      setLocalError(msg);
      setLocalMessage({ ok: false, text: msg });
    } finally {
      setLocalBusy(false);
    }
  };

  const stopLocal = async () => {
    await clearBackupDirHandle();
    const cfg = loadLocalSyncConfig();
    saveLocalSyncConfig({ ...cfg, enabled: false });
    setDirName(null);
    setEnabled(false);
    setLocalMessage({ ok: true, text: "已停止自动备份，文件夹授权已清除。" });
  };

  const mergeFromBridge = async () => {
    setBridgeMessage(null);
    setMessage(null);
    setBridgeBusy(true);
    try {
      const blob = await bridgeDownload();
      setBridgePending(true);
      setPhase("parsing");
      setProgress({ done: 0, total: 1, label: "正在读取其他设备的数据…" });
      const result = await onParse(blob as File, reportProgress);
      setPreview(result);
      setPhase("preview");
    } catch (e) {
      setBridgePending(false);
      setBridgeMessage({ ok: false, text: (e as Error).message || "拉取失败" });
    } finally {
      setBridgeBusy(false);
    }
  };

  const uploadBridgeNow = async () => {
    setBridgeMessage(null);
    setBridgeBusy(true);
    try {
      const { blob } = await buildBackupBlob(reportProgress);
      await bridgeUpload(blob);
      setBridgeLastSync();
      setBridgeLastSyncState(getBridgeLastSync());
      setBridgeMessage({ ok: true, text: "已上传当前题库，其他设备打开后即可同步。" });
    } catch (e) {
      setBridgeMessage({ ok: false, text: (e as Error).message || "上传失败" });
    } finally {
      setBridgeBusy(false);
    }
  };

  const saveLocalConfig = (next: { enabled?: boolean; keepCount?: number }) => {
    const cfg = loadLocalSyncConfig();
    const updated = { ...cfg, ...next };
    saveLocalSyncConfig(updated);
    if (next.enabled !== undefined) setEnabled(next.enabled);
    if (next.keepCount !== undefined) setKeepCount(next.keepCount);
  };

  const busy = phase === "exporting" || phase === "parsing" || phase === "importing";
  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <Sheet open={open} onClose={onClose} title="备份与恢复" className="backup-sheet">
      <div className="local-sync">
        <p className="section-label">
          <Archive size={15} />
          本地自动备份
        </p>
        <p className="field-hint">
          选一个电脑上的文件夹，以后打开应用或修改题目后会自动保存完整备份，只保留最近{" "}
          {keepCount} 份，不用手动导出。
        </p>
        <div className="local-sync-status">
          {dirName ? (
            <p>
              备份文件夹：<b>{dirName}</b>
              {lastBackup ? ` · 上次备份：${formatDateTime(lastBackup.at)}` : " · 还没有备份"}
            </p>
          ) : (
            <p>还没选择备份文件夹。</p>
          )}
        </div>
        {localError && <p className="backup-msg err">{localError}</p>}
        <div className="row wrap" style={{ gap: 10 }}>
          <button className="btn btn-ghost" disabled={localBusy} onClick={() => void chooseDir()}>
            {dirName ? "更换文件夹" : "选择文件夹"}
          </button>
          <button
            className="btn btn-primary"
            disabled={localBusy || !dirName}
            onClick={() => void backupNow()}
          >
            <Download size={15} />
            立即备份
          </button>
          {dirName && (
            <button className="btn btn-ghost" disabled={localBusy} onClick={() => void stopLocal()}>
              停止自动备份
            </button>
          )}
        </div>
        <div className="row wrap" style={{ gap: 14, marginTop: 12 }}>
          <label className="sync-toggle">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => saveLocalConfig({ enabled: e.target.checked })}
            />
            自动备份（打开应用时 + 修改后 30 秒）
          </label>
          <label className="local-keep">
            保留
            <select
              value={keepCount}
              onChange={(e) => saveLocalConfig({ keepCount: Number(e.target.value) })}
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            份
          </label>
        </div>
        {localBusy && progress && (
          <div className="backup-progress">
            <div
              className="progress-track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="backup-progress-label">{progress.label}</p>
          </div>
        )}
        {localMessage && (
          <p className={`backup-msg ${localMessage.ok ? "ok" : "err"}`}>{localMessage.text}</p>
        )}
      </div>

      <div className="backup-divider" />

      <div className="local-sync bridge-sync">
        <p className="section-label">
          <Cloud size={15} />
          局域网同步（手机 ↔ 电脑）
        </p>
        <p className="field-hint">
          电脑和手机连同一个 WiFi 时，题库会自动互通；也可以在这里手动拉取或上传。
        </p>
        <div className="local-sync-status">
          <p>
            {bridgeInfoState?.exists
              ? `本地服务数据：${formatDateTime(bridgeInfoState.modified ?? 0)}`
              : "本地服务还没有数据"}
            {bridgeLastSync > 0 ? ` · 上次同步：${formatDateTime(bridgeLastSync)}` : ""}
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <button
            className="btn btn-primary"
            disabled={bridgeBusy || !bridgeInfoState?.exists}
            onClick={() => void mergeFromBridge()}
          >
            <Cloud size={15} />
            从其他设备合并
          </button>
          <button className="btn btn-ghost" disabled={bridgeBusy} onClick={() => void uploadBridgeNow()}>
            <Upload size={15} />
            上传当前题库
          </button>
        </div>
        {bridgeMessage && (
          <p className={`backup-msg ${bridgeMessage.ok ? "ok" : "err"}`}>{bridgeMessage.text}</p>
        )}
      </div>

      <div className="backup-divider" />

      <div className="backup-intro">
        <p>手动导出/导入备份：导出的 ZIP 含全部图片原图，可用于换电脑或恢复。</p>
        <p className="muted">导入前会预览覆盖数量；旧版 JSON 备份也可以导入。</p>
      </div>

      <div className="backup-actions">
        <button
          id="export-backup-btn"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void runExport()}
        >
          <Download size={16} />
          导出完整备份（ZIP）
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Upload size={16} />
          导入备份
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,.json,application/zip,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {busy && progress && (
        <div className="backup-progress">
          <div
            className="progress-track"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="backup-progress-label">{progress.label}</p>
        </div>
      )}

      {phase === "preview" && preview && (
        <div className="backup-preview">
          <p className="backup-preview-title">即将导入</p>
          <div className="import-mode">
            <Segmented
              id="import-mode"
              value={importMode}
              options={[
                { value: "merge", label: "合并（保留现有）" },
                { value: "replace", label: "替换（删除现有）" },
              ]}
              onChange={setImportMode}
            />
          </div>
          <ul className="backup-preview-stats">
            <li>{preview.problems.length} 道题目</li>
            <li>{preview.methods.length} 个方法</li>
            <li>{preview.totalImages} 张图片</li>
          </ul>
          {preview.settings && (
            <p className="backup-preview-settings">
              设置：{["主题", preview.settings.localSync ? "本地自动备份" : ""]
                .filter(Boolean)
                .join(" · ")}
              将随备份一起恢复。
            </p>
          )}
          {importMode === "replace" ? (
            <p className="backup-preview-conflict warn">
              替换模式会先删除现有全部题目与方法，再导入备份，此操作无法撤销。
            </p>
          ) : (preview.overlapProblems > 0 || preview.overlapMethods > 0) && (
            <p className="backup-preview-conflict">
              其中 {preview.overlapProblems} 道题、{preview.overlapMethods} 个方法已存在，
              导入后会按 ID 覆盖。
            </p>
          )}
          <div className="backup-preview-actions">
            <button className="btn btn-ghost grow" onClick={() => reset()}>
              取消
            </button>
            <button className="btn btn-primary grow" onClick={() => void runImport()}>
              确认导入
            </button>
          </div>
        </div>
      )}

      {message && <p className={`backup-msg ${message.ok ? "ok" : "err"}`}>{message.text}</p>}

      <div className="clear-all">
        <p className="section-label">
          <Trash size={15} />
          清空全部数据
        </p>
        <p className="field-hint">
          永久删除所有题目、方法（含全部图片）与统计日志，无法撤销；建议先导出备份。
        </p>
        <button className="btn btn-danger" onClick={() => setConfirmClear(true)}>
          <Trash size={15} />
          清空全部题目与方法
        </button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="清空全部数据？"
        message="将永久删除所有题目、方法（含全部图片）与统计日志，此操作无法撤销。建议先导出备份再清空。"
        confirmLabel="清空全部"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          void (async () => {
            setConfirmClear(false);
            try {
              const text = await onClearAll();
              setMessage({ ok: true, text });
            } catch (e) {
              setMessage({ ok: false, text: (e as Error).message || "清空失败" });
            }
          })();
        }}
      />
    </Sheet>
  );
}
