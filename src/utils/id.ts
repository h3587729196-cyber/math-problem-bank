export function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  );
}

/** 生成唯一 ID：优先使用 crypto.randomUUID，旧浏览器自动降级 */
export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // 降级
  }
  return uid() + "-" + Math.random().toString(36).slice(2, 6);
}
