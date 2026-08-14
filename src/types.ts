export type ProblemStatus = "todo" | "solved" | "stuck";

export type ImageKind = "problem" | "solution";

export type MethodRole = "core" | "auxiliary" | "extension";

export interface ProblemMethodLink {
  id: string;
  methodId: string;
  role: MethodRole;
  note: string;
}

export interface ProblemImage {
  id: string;
  kind: ImageKind;
  caption: string;
  blob: Blob;
}

export interface MethodImage {
  id: string;
  caption: string;
  blob: Blob;
}

/** 方法掌握度：5 级细化分级 */
export type MethodMasteryLevel = 1 | 2 | 3 | 4 | 5;

export interface MethodMastery {
  level: MethodMasteryLevel;
  updatedAt: number;
}

export const MASTERY_LABEL: Record<MethodMasteryLevel, string> = {
  1: "了解",
  2: "会用",
  3: "熟练",
  4: "精通",
  5: "融会贯通",
};

export interface ThoughtStep {
  id: string;
  text: string;
  starred: boolean;
  cleverness: 1 | 2 | 3 | 4 | 5;
}

/** 一道题的解法图片（可选，每个解法最多一张） */
export interface SolutionImage {
  id: string;
  caption: string;
  blob: Blob;
}

/** 解法简易度：1 简单 / 2 适中 / 3 复杂 */
export type SolutionSimplicity = 1 | 2 | 3;

export const SIMPLICITY_LABEL: Record<SolutionSimplicity, string> = {
  1: "简单",
  2: "适中",
  3: "复杂",
};

/** 一组解法：名称 + 文字步骤 + 可选示意图 */
export interface ProblemSolution {
  id: string;
  label: string;
  steps: ThoughtStep[];
  image: SolutionImage | null;
  simplicity: SolutionSimplicity;
  clever: boolean;
}

/**
 * 回看排期（FSRS-Lite 记忆模型）：
 * - 稳定性 s：记忆保持率降到 90% 所需的天数（= 目标保持率下的复习间隔）
 * - 难度 d：条目本身多难记（1–10）
 * - lapse：连续失败次数；streak：连续做对次数
 * - lastAt：上次复习时间（用于计算当前记忆强度）
 * 遗忘曲线：R(t) = (1 + t/(9·s))^(-1)，t = s 时恰好 R = 90%。
 */
export interface ReviewInfo {
  stuckAt: number;
  nextReviewAt: number;
  reviewCount: number;
  /** 旧版熟练系数（迁移兼容，新版算法不再使用） */
  ease?: number;
  /** 记忆难度 1–10 */
  d?: number;
  /** 稳定性（天） */
  s?: number;
  /** 连续失败次数 */
  lapse?: number;
  /** 连续做对次数 */
  streak?: number;
  /** 上次复习时间 */
  lastAt?: number;
}

/** 旧版固定档位（迁移与兼容用） */
export const REVIEW_SCHEDULE_DAYS = [1, 3, 7, 14, 30] as const;

export function reviewDelayDays(reviewCount: number): number {
  const idx = Math.min(reviewCount, REVIEW_SCHEDULE_DAYS.length - 1);
  return REVIEW_SCHEDULE_DAYS[idx];
}

export function freshReview(now = Date.now(), difficultyHint = 3): ReviewInfo {
  return {
    stuckAt: now,
    nextReviewAt: now + 86400000,
    reviewCount: 0,
    d: Math.min(10, Math.max(1, difficultyHint)),
    s: 1,
    lapse: 0,
    streak: 0,
    lastAt: now,
  };
}

/** 认知曲线数据点：某次回看时「觉得的难度」 */
export interface FeltEntry {
  at: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

export interface Problem {
  id: string;
  title: string;
  status: ProblemStatus;
  difficulty: 1 | 2 | 3 | 4 | 5;
  source: string;
  tags: string[];
  images: ProblemImage[];
  solutions: ProblemSolution[];
  methodLinks: ProblemMethodLink[];
  /** 旧字段，仅用于兼容迁移；新数据请使用 solutions */
  thoughtSteps?: ThoughtStep[];
  review?: ReviewInfo;
  /** 认知曲线：每次认知回看时记录的「当时觉得的难度」（含录入时的第一个点） */
  feltHistory?: FeltEntry[];
  /** 旧字段（迁移兼容），新数据使用 feltHistory */
  feltDifficulty?: Problem["difficulty"];
  /** 高难度题（较难/困难）的认知回看排期 */
  hardReview?: ReviewInfo;
  createdAt: number;
  updatedAt: number;
}

export interface Method {
  id: string;
  name: string;
  description: string;
  signal: string;
  tags: string[];
  steps: string[];
  pitfalls: string;
  images: MethodImage[];
  mastery?: MethodMastery;
  /** 回看排期：掌握度低于熟练的方法 */
  review?: ReviewInfo;
  createdAt: number;
  updatedAt: number;
}

export type ProblemDraft = Omit<Problem, "id" | "createdAt" | "updatedAt">;

export interface TagStat {
  name: string;
  problemCount: number;
  methodCount: number;
}

export const STATUS_LABEL: Record<ProblemStatus, string> = {
  todo: "待做",
  solved: "已解",
  stuck: "卡住",
};

export const ROLE_LABEL: Record<MethodRole, string> = {
  core: "核心方法",
  auxiliary: "辅助方法",
  extension: "延伸方法",
};

export const ROLE_ORDER: MethodRole[] = ["core", "auxiliary", "extension"];

export const CLEVERNESS_LABEL: Record<number, string> = {
  1: "一般",
  2: "巧妙",
  3: "很妙",
  4: "极妙",
  5: "绝妙",
};
