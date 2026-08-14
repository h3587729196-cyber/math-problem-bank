export function backupFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `难题库备份-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}.zip`
  );
}

/** 按名称排序后，返回需要删除的旧备份文件名（保留最近 keepCount 份） */
export function rotateBackupNames(names: string[], keepCount: number): string[] {
  const zips = names
    .filter((n) => /^难题库备份-.*\.zip$/.test(n))
    .sort((a, b) => a.localeCompare(b));
  return zips.slice(0, Math.max(0, zips.length - keepCount));
}
