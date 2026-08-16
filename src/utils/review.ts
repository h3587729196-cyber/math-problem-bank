import type { ReviewInfo } from "../types";

/* ============================================================
 * 回看排期 · FSRS-4.5 风格记忆模型
 *
 * 借鉴 FSRS（Anki 2023+ 默认调度器）的双曲遗忘曲线：
 *
 *   R(t, S) = (1 + F·t/S)^DECAY，F = 1/TARGET^(-1/DECAY) - 1
 *
 * 取 DECAY = -0.5（幂律衰减，拟合真实记忆遗忘）、TARGET = 0.9：
 *  F = 0.9⁻² - 1 = 19/81 ≈ 0.2346，恰好 R(S) = 90%——
 * 稳定性 S 的定义仍是"记忆强度降到 90% 所需天数"。
 *
 * 稳定性更新（间隔如何增长）：
 *  - again（忘了）：S × (0.25 + 0.15·R)。复习前记忆还很强却忘了
 *    （R 高）说明编码失败，惩罚更深；S 下限 0.4 天保证明天再见。
 *  - hard（有点模糊）：S × 0.7，难度小幅上升。
 *  - good（做出来了）：S × (1 + g)，其中
 *      g = 1.25 · ease(D) · gain(R) · streakBoost
 *    - ease(D) = ((11-D)/10)^0.8：难度越低增长越快（高难条目增长平缓）
 *    - gain(R) = clamp((1-R)/0.1, 0.3, 1.8)：越接近遗忘临界点复习，
 *      记忆强化收益越大（间隔规划的最优性）
 *    - streakBoost = 1 + 0.06·min(streak,5)：连续成功微弱加成
 *
 * 难度（1–10）更新：again +1.2（连错 +0.2/次）、hard +0.6、good -0.4。
 * 目标保持率 90%，间隔 = max(1, ceil(S)) 天。
 * ========================================================== */

const DAY = 86400000;
export const TARGET_RETENTION = 0.9;
/** 双曲衰减指数（FSRS-4.5 用 -0.5） */
export const RETENTION_DECAY = -0.5;
/** F = 1/TARGET^(-1/DECAY) - 1 = 0.9⁻² - 1 = 19/81 ≈ 0.23457 */
export const RETENTION_FACTOR = Math.pow(TARGET_RETENTION, -1 / -RETENTION_DECAY) - 1;

export const S_MIN = 0.4;
export const S_MAX = 365;

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
    s: review.s != null && review.s > 0 ? clamp(review.s, S_MIN, S_MAX) : legacyDays,
    lapse: review.lapse ?? 0,
    streak: review.streak ?? 0,
  };
}

/** 双曲遗忘曲线：记忆强度（0–1），t 为距上次复习天数 */
export function retrievability(review: ReviewInfo, now = Date.now()): number {
  const st = reviewState(review);
  const lastAt = review.lastAt ?? review.stuckAt;
  const t = Math.max(0, (now - lastAt) / DAY);
  return Math.pow(1 + RETENTION_FACTOR * (t / st.s), -0.5);
}

/** 到期排序用：记忆强度越低越靠前（忘得最多的先复习） */
export function reviewPriority(review: ReviewInfo, now = Date.now()): number {
  return retrievability(review, now);
}

/** 下一次复习间隔（天） */
export function reviewDelayDays(review: ReviewInfo): number {
  return Math.max(1, Math.ceil(reviewState(review).s));
}

function calcAdvance(st: ReviewState, r: number, grade: ReviewGrade): ReviewState {
  if (grade === "again") {
    // R 高时遗忘 = 编码失败，惩罚更深；连错也会让难度爬升更快
    const recallPenalty = 0.25 + 0.15 * clamp(r, 0, 1);
    return {
      d: Math.min(10, st.d + 1.2 + 0.2 * Math.min(st.lapse, 3)),
      s: Math.max(S_MIN, st.s * recallPenalty),
      lapse: st.lapse + 1,
      streak: 0,
    };
  }
  if (grade === "hard") {
    return {
      d: Math.min(10, st.d + 0.6),
      s: Math.max(0.5, st.s * 0.7),
      lapse: st.lapse,
      streak: 0,
    };
  }
  // good：临界点复习增益 × 难度缓解 × 连击加成
  const ease = Math.pow((11 - st.d) / 10, 0.8);
  const gain = clamp((1 - r) / (1 - TARGET_RETENTION), 0.3, 1.8);
  const boost = 1 + 0.06 * Math.min(st.streak, 5);
  const growth = 1 + 1.25 * ease * gain * boost;
  return {
    d: Math.max(1.2, st.d - 0.4),
    s: Math.min(S_MAX, st.s * growth),
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
  const r = Math.pow(1 + RETENTION_FACTOR * (t / st.s), -0.5);
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
  const r = Math.pow(1 + RETENTION_FACTOR * (t / st.s), -0.5);
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

/* ============================================================
 * 认知回看 · 感知难度模型
 *
 * 每次回看让用户报告「现在觉得的难度」（1–5）。难度字段是慢变量，
 * 不应被单次感受的噪声直接改写，因此用指数加权平滑（EWMA）：
 *
 *   est = 0.6·felt + 0.4·current
 *   target = round(est)
 *   实际只向 target 方向移动 1 档（渐进，防噪声跳变）
 *
 * 这样：
 *  - 连续多次同感 → 难度收敛到感知值（后验趋于稳定）
 *  - 单次跳变（如 5 觉得 1）→ 每次只降 1 档，避免误判
 *  - 5 → felt 4 → 4；4 → felt 3 → 3（降档毕业路径平滑）
 *
 * 排期：觉得变简单 → good（间隔拉长）；还是难 → again（1 天后再见）。
 * 连续两次同感 → 认知已稳定，good 间隔额外 ×1.3。
 * ========================================================== */

export type FeltDifficulty = 1 | 2 | 3 | 4 | 5;

/** EWMA 感知目标难度（可能等于 current，实际移动见 cognitiveRecord） */
export function perceivedDifficulty(current: number, felt: number): FeltDifficulty {
  const c = clamp(Math.round(current), 1, 5);
  const f = clamp(Math.round(felt), 1, 5);
  const est = 0.6 * f + 0.4 * c;
  const target = Math.round(est);
  if (target < c) return Math.max(1, c - 1) as FeltDifficulty;
  if (target > c) return Math.min(5, c + 1) as FeltDifficulty;
  return c as FeltDifficulty;
}

export interface CognitiveRecordResult {
  /** 调整后的题目难度（1–5） */
  difficulty: FeltDifficulty;
  /** 下次认知回看排期；undefined = 已毕业（难度 < 4） */
  review?: ReviewInfo;
}

/**
 * 认知回看记录：根据本次「觉得的难度」更新题目难度与排期。
 * prevFelt 为上一次记录的感知（用于判断认知是否稳定）。
 */
export function cognitiveRecord(
  current: number,
  felt: number,
  review: ReviewInfo | undefined,
  now: number,
  prevFelt?: number
): CognitiveRecordResult {
  const cur = clamp(Math.round(current), 1, 5);
  const f = clamp(Math.round(felt), 1, 5);
  const next = perceivedDifficulty(cur, f);
  const r = review ?? hardInitialReview(now);
  if (next < 4) {
    // 毕业：难度降到可接受区间，退出认知回看
    return { difficulty: next, review: undefined };
  }
  const improved = f < cur;
  let nextReview = advanceReview(r, improved ? "good" : "again", now);
  if (improved && prevFelt === f) {
    // 连续两次同感：认知已稳定，间隔拉长 30%
    const days = Math.max(1, Math.ceil((nextReview.nextReviewAt - now) / DAY));
    nextReview = { ...nextReview, nextReviewAt: now + Math.ceil(days * 1.3) * DAY };
  }
  return { difficulty: next, review: nextReview };
}
