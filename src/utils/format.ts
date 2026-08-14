const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${formatDate(ts)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const DIFFICULTY_LABEL = ["", "简单", "较易", "中等", "较难", "困难"];
