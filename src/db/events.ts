import { db, STORES } from "./idb";
import { uid } from "../utils/id";

export type AppEventType =
  | "add"
  | "delete"
  | "stuck"
  | "solved"
  | "review-solved"
  | "review-postpone"
  | "open";

export interface AppEvent {
  id: string;
  type: AppEventType;
  problemId?: string;
  methodId?: string;
  at: number;
}

// 打开题目的日志做节流：同一道题一小时内只记一次，避免刷屏
const lastOpenAt = new Map<string, number>();

export async function logEvent(
  type: AppEventType,
  opts: { problemId?: string; methodId?: string } = {}
): Promise<void> {
  if (type === "open" && opts.problemId) {
    const last = lastOpenAt.get(opts.problemId) ?? 0;
    if (Date.now() - last < 3600000) return;
    lastOpenAt.set(opts.problemId, Date.now());
  }
  try {
    await db.put<AppEvent>(STORES.EVENTS, {
      id: uid(),
      type,
      problemId: opts.problemId,
      methodId: opts.methodId,
      at: Date.now(),
    });
  } catch {
    // 日志失败不影响主流程
  }
}

export async function getEvents(): Promise<AppEvent[]> {
  try {
    return await db.all<AppEvent>(STORES.EVENTS);
  } catch {
    return [];
  }
}
