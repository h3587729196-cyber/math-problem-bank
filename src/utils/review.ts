import type { ReviewInfo } from "../types";

/* ============================================================
 * 回看排期 · FSRS-Lite 记忆模型
 *
 * 借鉴 FSRS（Anki 2023+ 默认调度器）的记忆三态模型：
 *  - 稳定性 s：记忆保持率降到目标值所需的天数
 *  - 难度 d：条目多难记（1–10）
 *  - 遗忘曲线：R(t) = (1 + t/(9·s))^(-1)  →  t = s 时 R = 90%
 *
 * 评级（三级）：
 *  - again（忘了）：稳定性塌缩至 25%，难度 +1.2，连续失败 +1
 *  - hard（有点模糊）：稳定性 ×0.7，难度 +0.4
 *  - good（做出来了）：按难度与当前记忆强度计算增长因子，
 *    难度越低、复习时机越接近临界点，间隔增长越快
 *
 * 目标保持率：90%（稳定性 s 因此天然等于"间隔天数"）
 * ========================================================== */

const DAY = 86400000;
export const TARGET_RETENTION = 0.9;
export const RETENTION_FACTOR = 9;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface ReviewState {
  d: number;
  s: number;
  lapse: number;
  streak: number;
}

export type ReviewGrade = "again" | "hard" | "good";

/** 旧版固定档位（用于迁移旧数据） */
const LEGACY_SCHEDULE = [1, 3, 7, 14, 30];

/** 归一化记忆状态；旧数据（只有 ease）自动推导 */
export function reviewState(review: ReviewInfo): ReviewState {
  const ease =
    typeof review.ease === "number" && review.ease >= 0.6 && review.ease <= 3
      ? review.ease
      : 1;
  const legacyDays = Math.max(
    1,
    Math.round(LEGACY_SCHEDULE[Math.min(review.reviewCount, LEGACY_SCHEDULE.length - 1)] * ease)
  );
  return {
    d: review.d != null ? clamp(review.d, 1, 10) : clamp(7 - ease * 2.2, 1, 10),
    s: review.s != null && review.s > 0 ? review.s : legacyDays,
    lapse: review.lapse ?? 0,
    streak: review.streak ?? 0,
  };
}

/** 当前记忆强度（0–1）：距上次复习越久越低 */
export function retrievability(review: ReviewInfo, now = Date.now()): number {
  const st = reviewState(review);
  const lastAt = review.lastAt ?? review.stuckAt;
  const t = Math.max(0, (now - lastAt) / DAY);
  return Math.pow(1 + t / (RETENTION_FACTOR * st.s), -1);
}

/** 到期排序用：记忆强度越低越靠前（忘得最多的先复习） */
export function reviewPriority(review: ReviewInfo, now = Date.now()): number {
  return retrievability(review, now);
}

/** 下一次复习间隔（天） */
export function reviewDelayDays(review: ReviewInfo): number {
  return Math.max(1, Math.ceil(reviewState(review).s));
}

function calcAdvance(
  st: ReviewState,
  r: number,
  grade: ReviewGrade
): ReviewState {
  if (grade === "again") {
    return {
      d: Math.min(10, st.d + 1.2),
      s: Math.max(0.5, st.s * 0.25),
      lapse: st.lapse + 1,
      streak: 0,
    };
  }
  if (grade === "hard") {
    return {
      d: Math.min(10, st.d + 0.4),
      s: Math.max(0.6, st.s * 0.7),
      lapse: st.lapse,
      streak: 0,
    };
  }
  const growth =
    1 +
    1.15 *
      ((11 - st.d) / 10) *
      clamp((1 - r) / (1 - TARGET_RETENTION), 0.2, 1.5);
  return {
    d: Math.max(1.2, st.d - 0.4),
    s: st.s * growth,
    lapse: 0,
    streak: st.streak + 1,
  };
}

/** 评级后推进排期 */
export function advanceReview(
  review: ReviewInfo,
  result: ReviewGrade | "success" | "fail",
  now = Date.now()
): ReviewInfo {
  const grade: ReviewGrade =
    result === "success" ? "good" : result === "fail" ? "again" : result;
  const st = reviewState(review);
  const lastAt = review.lastAt ?? review.stuckAt;
  const t = Math.max(0, (now - lastAt) / DAY);
  const r = Math.pow(1 + t / (RETENTION_FACTOR * st.s), -1);
  const next = calcAdvance(st, r, grade);
  const days = Math.max(1, Math.ceil(next.s));
  return {
    stuckAt: review.stuckAt,
    nextReviewAt: now + days * DAY,
    reviewCount: review.reviewCount + 1,
    ease: review.ease,
    d: next.d,
    s: next.s,
    lapse: next.lapse,
    streak: next.streak,
    lastAt: now,
  };
}

/** 预览某个评级后的间隔（用于按钮文案，不产生副作用） */
export function predictIntervalDays(
  review: ReviewInfo,
  result: ReviewGrade | "success" | "fail",
  now = Date.now()
): number {
  const grade: ReviewGrade =
    result === "success" ? "good" : result === "fail" ? "again" : result;
  const st = reviewState(review);
  const lastAt = review.lastAt ?? review.stuckAt;
  const t = Math.max(0, (now - lastAt) / DAY);
  const r = Math.pow(1 + t / (RETENTION_FACTOR * st.s), -1);
  return Math.max(1, Math.ceil(calcAdvance(st, r, grade).s));
}

/** 题目卡住，首次进入回看：难度来自题目难度（1–5 → 1–10） */
export function problemInitialReview(difficulty: number, now = Date.now()): ReviewInfo {
  return {
    stuckAt: now,
    nextReviewAt: now + DAY,
    reviewCount: 0,
    d: clamp(3 + difficulty, 1, 10),
    s: 1,
    lapse: 0,
    streak: 0,
    lastAt: now,
  };
}

/** 方法首次进入回看：掌握度越低越难记 */
export function methodInitialReview(level: number | undefined, now = Date.now()): ReviewInfo {
  const lv = level && level >= 1 && level <= 5 ? level : 1;
  return {
    stuckAt: now,
    nextReviewAt: now + (lv === 2 ? 2 : 1) * DAY,
    reviewCount: 0,
    d: clamp(4 + (3 - lv) * 1.5, 1, 10),
    s: lv === 2 ? 2 : 1,
    lapse: 0,
    streak: 0,
    lastAt: now,
  };
}

/** 方法是否低于「熟练」（需要回看） */
export function methodNeedsReview(level: number | undefined): boolean {
  const lv = level && level >= 1 && level <= 5 ? level : 1;
  return lv < 3;
}

/** 高难度题（较难/困难）首次进入认知回看：3 天后 */
export function hardInitialReview(now = Date.now()): ReviewInfo {
  return {
    stuckAt: now,
    nextReviewAt: now + 3 * DAY,
    reviewCount: 0,
    d: 5,
    s: 3,
    lapse: 0,
    streak: 0,
    lastAt: now,
  };
}
