import type { Method, Problem } from "../types";
import type { AppEvent } from "../db/events";

const MASTERY_LABELS: Record<number, string> = {
  1: "了解",
  2: "会用",
  3: "熟练",
  4: "精通",
  5: "融会贯通",
};

export type ReportRange = "month" | "90d" | "all" | "custom";

export interface RangeBounds {
  start: number;
  end: number;
}

export interface RangeInfo {
  key: ReportRange;
  label: string;
  start: number;
  end: number;
}

export function rangeInfo(
  range: ReportRange,
  now = Date.now(),
  custom?: RangeBounds
): RangeInfo {
  if (range === "custom" && custom) {
    return { key: range, label: "自定义", start: custom.start, end: custom.end };
  }
  if (range === "month") {
    const d = new Date(now);
    return {
      key: range,
      label: "本月",
      start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
      end: now,
    };
  }
  if (range === "90d") {
    return { key: range, label: "近 90 天", start: now - 90 * 86400000, end: now };
  }
  return { key: range, label: "全部", start: 0, end: now };
}

export interface SolveRecord {
  problemId: string;
  stuckAt: number;
  solvedAt: number;
  durationMs: number;
}

/** 把事件流配对成“卡住 → 解开”记录 */
export function solveRecords(events: AppEvent[]): SolveRecord[] {
  const byProblem = new Map<string, AppEvent[]>();
  for (const e of events) {
    if (!e.problemId) continue;
    const list = byProblem.get(e.problemId) ?? [];
    list.push(e);
    byProblem.set(e.problemId, list);
  }
  const out: SolveRecord[] = [];
  for (const [problemId, list] of byProblem) {
    list.sort((a, b) => a.at - b.at);
    let lastStuck = 0;
    for (const e of list) {
      if (e.type === "stuck") {
        lastStuck = e.at;
      } else if (e.type === "solved" && lastStuck) {
        out.push({
          problemId,
          stuckAt: lastStuck,
          solvedAt: e.at,
          durationMs: e.at - lastStuck,
        });
        lastStuck = 0;
      }
    }
  }
  return out;
}

export interface WeakTag {
  tag: string;
  total: number;
  solvedCount: number;
  stuckCount: number;
  solveRate: number;
  avgStuckHours: number;
  avgDifficulty: number;
  reviewCount: number;
}

export interface MethodStat {
  name: string;
  linkedCount: number;
  lastUsedAt: number;
  idleDays: number | null;
  masteryLevel: number | null;
  masteryLabel: string;
  autoState: "new" | "hot" | "steady" | "rusty" | "idle";
  autoStateLabel: string;
}

export interface SolutionStats {
  total: number;
  simplicityDist: { level: number; label: string; count: number }[];
  cleverCount: number;
  cleverRate: number;
}

const AUTO_STATE_LABEL = {
  new: "新方法",
  hot: "高频使用",
  steady: "稳定使用",
  rusty: "开始生疏",
  idle: "闲置未用",
} as const;

export interface Kpi {
  total: number;
  solved: number;
  stuck: number;
  todo: number;
  solveRate: number;
  addedInRange: number;
  solvedInRange: number;
  avgSolveHours: number | null;
  longestSolveHours: number | null;
  reviewTotal: number;
  reviewSolved: number;
  reviewOnTimeRate: number | null;
  cleverCount: number;
}

export interface ReportData {
  range: RangeInfo;
  generatedAt: number;
  kpi: Kpi;
  statusDist: { status: string; count: number }[];
  weeklyTrend: { label: string; added: number; solved: number }[];
  stuckAgeBuckets: { label: string; count: number }[];
  weakTags: WeakTag[];
  methods: MethodStat[];
  difficulty: { level: number; count: number; solved: number; solveRate: number }[];
  cleverDist: { level: number; count: number }[];
  activity: { activeDays: number; hourDist: number[]; weekdayDist: number[] };
  compare: {
    addedDeltaPct: number | null;
    solvedDeltaPct: number | null;
    reviewRateDelta: number | null;
  } | null;
  masteryDist: { level: number; label: string; count: number }[];
  masteryUnset: number;
  solutions: SolutionStats;
  focusMethods: {
    name: string;
    masteryLevel: number | null;
    levelLabel: string;
    autoStateLabel: string;
    linkedCount: number;
  }[];
  topSolves: {
    problemId: string;
    title: string;
    tags: string[];
    difficulty: number;
    hours: number;
  }[];
  note: string;
}

const DAY = 86400000;
const HOUR = 3600000;

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

function startOfWeek(now: number): number {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // 周一为 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function buildReport(
  problems: Problem[],
  methods: Method[],
  events: AppEvent[],
  range: ReportRange,
  now = Date.now(),
  custom?: RangeBounds
): ReportData {
  const r = rangeInfo(range, now, custom);
  const inRange = (ts: number) => ts >= r.start && ts <= r.end;

  const solved = problems.filter((p) => p.status === "solved").length;
  const stuck = problems.filter((p) => p.status === "stuck").length;
  const todo = problems.length - solved - stuck;

  const pairs = solveRecords(events);
  const pairsInRange = pairs.filter((p) => inRange(p.solvedAt));
  const addedInRange = problems.filter((p) => inRange(p.createdAt)).length;
  const avgSolveHours = pairsInRange.length
    ? Math.round((mean(pairsInRange.map((p) => p.durationMs)) / HOUR) * 10) / 10
    : null;
  const longestSolveHours = pairsInRange.length
    ? Math.round((Math.max(...pairsInRange.map((p) => p.durationMs)) / HOUR) * 10) / 10
    : null;

  const rangeEvents = events.filter((e) => inRange(e.at));
  const reviewSolved = rangeEvents.filter((e) => e.type === "review-solved").length;
  const reviewPostpone = rangeEvents.filter((e) => e.type === "review-postpone").length;
  const reviewTotal = reviewSolved + reviewPostpone;

  const cleverCount = problems.reduce(
    (n, p) =>
      n +
      (p.solutions ?? []).reduce(
        (m, s) => m + s.steps.filter((x) => x.starred).length,
        0
      ),
    0
  );

  const kpi: Kpi = {
    total: problems.length,
    solved,
    stuck,
    todo,
    solveRate: problems.length ? solved / problems.length : 0,
    addedInRange,
    solvedInRange: pairsInRange.length,
    avgSolveHours,
    longestSolveHours,
    reviewTotal,
    reviewSolved,
    reviewOnTimeRate: reviewTotal ? reviewSolved / reviewTotal : null,
    cleverCount,
  };

  // 与上一期对比（等长前移窗口）
  let compare: ReportData["compare"] = null;
  if (r.key !== "all" && r.start > 0) {
    const duration = r.end - r.start;
    const prevStart = r.start - duration;
    const prevEnd = r.start;
    const prevAdded = problems.filter(
      (p) => p.createdAt >= prevStart && p.createdAt < prevEnd
    ).length;
    const prevSolved = pairs.filter(
      (p) => p.solvedAt >= prevStart && p.solvedAt < prevEnd
    ).length;
    const prevEvents = events.filter((e) => e.at >= prevStart && e.at < prevEnd);
    const prevReviewSolved = prevEvents.filter((e) => e.type === "review-solved").length;
    const prevReviewTotal =
      prevReviewSolved + prevEvents.filter((e) => e.type === "review-postpone").length;
    const pctDelta = (cur: number, prev: number) =>
      prev > 0
        ? Math.round(((cur - prev) / prev) * 100)
        : cur > 0
          ? 100
          : null;
    compare = {
      addedDeltaPct: pctDelta(kpi.addedInRange, prevAdded),
      solvedDeltaPct: pctDelta(kpi.solvedInRange, prevSolved),
      reviewRateDelta:
        prevReviewTotal > 0
          ? Math.round(
              (kpi.reviewOnTimeRate ?? 0) * 100 - (prevReviewSolved / prevReviewTotal) * 100
            )
          : kpi.reviewTotal > 0
            ? Math.round((kpi.reviewOnTimeRate ?? 0) * 100)
            : null,
    };
  }

  const statusDist = [
    { status: "已解", count: solved },
    { status: "卡住", count: stuck },
    { status: "待做", count: todo },
  ].filter((x) => x.count > 0);

  const weeklyTrend: { label: string; added: number; solved: number }[] = [];
  const weekStart = startOfWeek(now);
  for (let i = 11; i >= 0; i--) {
    const s = weekStart - i * 7 * DAY;
    const e = s + 7 * DAY;
    const d = new Date(s + 3 * DAY);
    weeklyTrend.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      added: problems.filter((p) => p.createdAt >= s && p.createdAt < e).length,
      solved: pairs.filter((p) => p.solvedAt >= s && p.solvedAt < e).length,
    });
  }

  const buckets = [
    { label: "< 1 天", min: 0, max: 24 * HOUR },
    { label: "1–3 天", min: 24 * HOUR, max: 3 * DAY },
    { label: "3–7 天", min: 3 * DAY, max: 7 * DAY },
    { label: "7–14 天", min: 7 * DAY, max: 14 * DAY },
    { label: "14–30 天", min: 14 * DAY, max: 30 * DAY },
    { label: "> 30 天", min: 30 * DAY, max: Infinity },
  ];
  const stuckAgeBuckets = buckets.map((b) => ({
    label: b.label,
    count: problems.filter((p) => {
      if (p.status !== "stuck") return false;
      const age = now - (p.review?.stuckAt || p.updatedAt || now);
      return age >= b.min && age < b.max;
    }).length,
  }));

  // 薄弱点：按标签汇总
  const tagMap = new Map<
    string,
    {
      total: number;
      solvedCount: number;
      stuckCount: number;
      diffSum: number;
      stuckHoursSum: number;
      reviewCount: number;
    }
  >();
  for (const p of problems) {
    for (const t of p.tags) {
      const cur = tagMap.get(t) ?? {
        total: 0,
        solvedCount: 0,
        stuckCount: 0,
        diffSum: 0,
        stuckHoursSum: 0,
        reviewCount: 0,
      };
      cur.total += 1;
      cur.diffSum += p.difficulty;
      if (p.status === "solved") cur.solvedCount += 1;
      if (p.status === "stuck") {
        cur.stuckCount += 1;
        cur.stuckHoursSum += (now - (p.review?.stuckAt || p.updatedAt || now)) / HOUR;
      }
      tagMap.set(t, cur);
    }
  }
  const reviewProblems = new Set(
    rangeEvents.filter((e) => e.type === "review-solved" || e.type === "review-postpone")
      .map((e) => e.problemId)
  );
  const weakTags: WeakTag[] = [];
  for (const [tag, c] of tagMap) {
    weakTags.push({
      tag,
      total: c.total,
      solvedCount: c.solvedCount,
      stuckCount: c.stuckCount,
      solveRate: c.total ? c.solvedCount / c.total : 0,
      avgStuckHours: c.stuckCount ? Math.round((c.stuckHoursSum / c.stuckCount) * 10) / 10 : 0,
      avgDifficulty: c.total ? Math.round((c.diffSum / c.total) * 10) / 10 : 0,
      reviewCount: problems.filter((p) => p.tags.includes(tag) && reviewProblems.has(p.id)).length,
    });
  }
  weakTags.sort(
    (a, b) =>
      b.stuckCount - a.stuckCount || a.solveRate - b.solveRate || b.total - a.total
  );
  const weakTop = weakTags
    .filter((t) => t.total >= 1 && (t.stuckCount > 0 || t.reviewCount > 0))
    .slice(0, 5);

  const problemsById = new Map(problems.map((p) => [p.id, p]));
  const autoState = (m: Method): MethodStat["autoState"] => {
    const linked = problems.filter((p) => p.methodLinks?.some((l) => l.methodId === m.id));
    const lastUsedAt = linked.reduce((mx, p) => Math.max(mx, p.updatedAt || 0), 0);
    if (linked.length === 0) {
      return m.createdAt && now - m.createdAt < 7 * DAY ? "new" : "idle";
    }
    if (linked.length >= 5 && now - lastUsedAt < 30 * DAY) return "hot";
    if (now - lastUsedAt < 30 * DAY) return "steady";
    return "rusty";
  };
  const methodStats: MethodStat[] = methods.map((m) => {
    const linked = problems.filter((p) => p.methodLinks?.some((l) => l.methodId === m.id));
    const lastUsedAt = linked.reduce((mx, p) => Math.max(mx, p.updatedAt || 0), 0);
    const state = autoState(m);
    return {
      name: m.name,
      linkedCount: linked.length,
      lastUsedAt,
      idleDays: linked.length
        ? Math.max(0, Math.floor((now - lastUsedAt) / DAY))
        : m.createdAt
          ? Math.max(0, Math.floor((now - m.createdAt) / DAY))
          : null,
      masteryLevel: m.mastery?.level ?? null,
      masteryLabel: m.mastery ? MASTERY_LABELS[m.mastery.level] : "未设置",
      autoState: state,
      autoStateLabel: AUTO_STATE_LABEL[state],
    };
  });
  methodStats.sort((a, b) => b.linkedCount - a.linkedCount);

  const masteryDist = [1, 2, 3, 4, 5].map((level) => ({
    level,
    label: MASTERY_LABELS[level],
    count: methods.filter((m) => m.mastery?.level === level).length,
  }));
  const masteryUnset = methods.filter((m) => !m.mastery).length;
  const allSolutions = problems.flatMap((p) => p.solutions ?? []);
  const solutions: SolutionStats = {
    total: allSolutions.length,
    simplicityDist: [1, 2, 3].map((level) => ({
      level,
      label: ["简单", "适中", "复杂"][level - 1],
      count: allSolutions.filter((s) => (s.simplicity ?? 2) === level).length,
    })),
    cleverCount: allSolutions.filter((s) => s.clever === true).length,
    cleverRate: allSolutions.length
      ? allSolutions.filter((s) => s.clever === true).length / allSolutions.length
      : 0,
  };
  const focusMethods = methods
    .map((m) => {
      const linked = problems.filter((p) => p.methodLinks?.some((l) => l.methodId === m.id));
      const state = autoState(m);
      const level = m.mastery?.level ?? 0;
      const need =
        state === "rusty" ||
        (state === "idle" && linked.length > 0) ||
        (level >= 1 && level <= 2);
      return { m, state, level, linked: linked.length, need };
    })
    .filter((x) => x.need)
    .sort((a, b) => a.level - b.level || a.linked - b.linked)
    .slice(0, 5)
    .map((x) => ({
      name: x.m.name,
      masteryLevel: x.m.mastery?.level ?? null,
      levelLabel: x.m.mastery ? MASTERY_LABELS[x.m.mastery.level] : "未设置",
      autoStateLabel: AUTO_STATE_LABEL[x.state],
      linkedCount: x.linked,
    }));

  const difficulty = [1, 2, 3, 4, 5].map((level) => {
    const list = problems.filter((p) => p.difficulty === level);
    const s = list.filter((p) => p.status === "solved").length;
    return {
      level,
      count: list.length,
      solved: s,
      solveRate: list.length ? s / list.length : 0,
    };
  });

  const cleverDist = [1, 2, 3, 4, 5].map((level) => ({
    level,
    count: problems.reduce(
      (n, p) =>
        n +
        (p.solutions ?? []).reduce(
          (m, s) => m + s.steps.filter((x) => x.starred && x.cleverness === level).length,
          0
        ),
      0
    ),
  }));

  // 活跃度：优先用“打开题目”事件，没有时用范围内题目的更新时间
  const activityEvents = rangeEvents.filter((e) => e.type === "open");
  const activitySource =
    activityEvents.length > 0
      ? activityEvents.map((e) => e.at)
      : problems.filter((p) => inRange(p.updatedAt)).map((p) => p.updatedAt);
  const activeDays = new Set(activitySource.map((ts) => dayKey(ts))).size;
  const hourDist = new Array(24).fill(0) as number[];
  const weekdayDist = new Array(7).fill(0) as number[];
  for (const ts of activitySource) {
    const d = new Date(ts);
    hourDist[d.getHours()] += 1;
    weekdayDist[(d.getDay() + 6) % 7] += 1;
  }

  const topSolves = [...pairsInRange]
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 5)
    .map((p) => {
      const problem = problemsById.get(p.problemId);
      return {
        problemId: p.problemId,
        title: problem?.title || "已删除的题目",
        tags: problem?.tags ?? [],
        difficulty: problem?.difficulty ?? 0,
        hours: Math.round((p.durationMs / HOUR) * 10) / 10,
      };
    });

  return {
    range: r,
    generatedAt: now,
    kpi,
    statusDist,
    weeklyTrend,
    stuckAgeBuckets,
    weakTags: weakTop,
    methods: methodStats.slice(0, 8),
    difficulty,
    cleverDist,
    activity: { activeDays, hourDist, weekdayDist },
    compare,
    masteryDist,
    masteryUnset,
    solutions,
    focusMethods,
    topSolves,
    note: "攻克用时、回看与活跃度统计自启用日志功能起；当前状态、难度与标签快照基于全部题目。",
  };
}
