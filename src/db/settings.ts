export type ThemeChoice = "system" | "light" | "dark";

export interface BackupSettings {
  theme?: ThemeChoice;
  localSync?: {
    enabled?: boolean;
    keepCount?: number;
  };
}

/** 读取页面上所有可设置的配置，随备份一起导出 */
export function readBackupSettings(): BackupSettings {
  const settings: BackupSettings = {};

  const theme = localStorage.getItem("mb-theme");
  if (theme === "light" || theme === "dark" || theme === "system") {
    settings.theme = theme;
  }

  try {
    const raw = localStorage.getItem("mb-local-sync-config");
    if (raw) {
      const cfg = JSON.parse(raw) as { enabled?: boolean; keepCount?: number };
      settings.localSync = {
        enabled: cfg.enabled === true,
        keepCount: Number(cfg.keepCount) || 10,
      };
    }
  } catch {
    // 忽略损坏的本地设置
  }

  return settings;
}

/** 导入备份后恢复设置 */
export function applyBackupSettings(settings: BackupSettings | undefined): void {
  if (!settings) return;

  if (settings.theme) {
    localStorage.setItem("mb-theme", settings.theme);
    if (settings.theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
  }

  if (settings.localSync) {
    const current = (() => {
      try {
        return JSON.parse(localStorage.getItem("mb-local-sync-config") || "{}") as {
          enabled?: boolean;
          keepCount?: number;
        };
      } catch {
        return {};
      }
    })();
    localStorage.setItem(
      "mb-local-sync-config",
      JSON.stringify({
        ...current,
        enabled: settings.localSync.enabled,
        keepCount: settings.localSync.keepCount,
      })
    );
  }
}
