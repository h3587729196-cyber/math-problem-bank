import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, STORES } from "../db/idb";
import { seedIfEmpty } from "../db/seed";
import { logEvent } from "../db/events";
import type {
  Method,
  MethodMasteryLevel,
  Problem,
  ProblemDraft,
  ProblemSolution,
  TagStat,
  ThoughtStep,
} from "../types";
import { REVIEW_SCHEDULE_DAYS } from "../types";
import { toThoughtStep } from "../utils/steps";
import { newId, uid } from "../utils/id";
import {
  methodInitialReview,
  methodNeedsReview,
  hardInitialReview,
} from "../utils/review";

type ProblemRecord = { p: Problem; migrated: boolean };
type MethodRecord = { m: Method; migrated: boolean };

export function useStore() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seeded, setSeeded] = useState(false);
  const problemsRef = useRef<Problem[]>([]);
  const methodsRef = useRef<Method[]>([]);

  const commitProblems = useCallback((next: Problem[]) => {
    problemsRef.current = next;
    setProblems(next);
  }, []);

  const commitMethods = useCallback((next: Method[]) => {
    methodsRef.current = next;
    setMethods(next);
  }, []);

  const sortProblems = useCallback((list: Problem[]) => {
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);

  const sortMethods = useCallback((list: Method[]) => {
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let ps = (await db.all<Problem>(STORES.PROBLEMS)).map(normalizeProblem);
        let ms = (await db.all<Method>(STORES.METHODS)).map(normalizeMethod);
        const needsMigrate = [...ps, ...ms].filter((r) => r.migrated);
        if (needsMigrate.length > 0) {
          await Promise.all([
            ...ps.filter((r) => r.migrated).map((r) => db.put(STORES.PROBLEMS, r.p)),
            ...ms.filter((r) => r.migrated).map((r) => db.put(STORES.METHODS, r.m)),
          ]);
        }
        if (ps.length === 0 && ms.length === 0) {
          setSeeded(true);
          await seedIfEmpty();
          ps = (await db.all<Problem>(STORES.PROBLEMS)).map(normalizeProblem);
          ms = (await db.all<Method>(STORES.METHODS)).map(normalizeMethod);
        }
        if (!alive) return;
        commitProblems(ps.map((r) => r.p).sort((a, b) => b.updatedAt - a.updatedAt));
        commitMethods(ms.map((r) => r.m).sort((a, b) => b.updatedAt - a.updatedAt));
        setReady(true);
      } catch (e) {
        if (alive) setLoadError((e as Error).message || "打开题库失败");
      }
    })();
    return () => {
      alive = false;
    };
  }, [commitProblems, commitMethods]);

  const addProblem = useCallback(
    async (draft: ProblemDraft) => {
      const now = Date.now();
      const p: Problem = {
        ...draft,
        id: newId(),
        createdAt: now,
        updatedAt: now,
        feltHistory:
          draft.feltHistory && draft.feltHistory.length > 0
            ? draft.feltHistory
            : [{ at: now, difficulty: draft.difficulty }],
        hardReview:
          draft.hardReview ??
          (draft.difficulty >= 4 ? hardInitialReview(now) : undefined),
      };
      await db.put(STORES.PROBLEMS, p);
      void logEvent("add", { problemId: p.id });
      commitProblems([p, ...problemsRef.current]);
      return p;
    },
    [commitProblems]
  );

  const updateProblem = useCallback(
    async (id: string, patch: Partial<ProblemDraft>) => {
      const prev = problemsRef.current;
      const now = Date.now();
      const original = prev.find((x) => x.id === id);
      const appliedPatch = { ...patch };
      if (original && "difficulty" in patch && patch.hardReview === undefined) {
        const level = patch.difficulty ?? original.difficulty;
        if (level >= 4) {
          if (!original.hardReview) appliedPatch.hardReview = hardInitialReview(now);
        } else {
          appliedPatch.hardReview = undefined;
        }
      }
      const next = sortProblems(
        prev.map((p) => (p.id === id ? { ...p, ...appliedPatch, updatedAt: now } : p))
      );
      const updated = next.find((p) => p.id === id);
      if (!updated) return;
      commitProblems(next);
      try {
        await db.put(STORES.PROBLEMS, updated);
        const original = prev.find((x) => x.id === id);
        if (original) {
          if (patch.status === "solved" && original.status === "stuck") {
            void logEvent("solved", { problemId: id });
            if ((original.review?.reviewCount ?? 0) > 0) {
              void logEvent("review-solved", { problemId: id });
            }
          }
          if (patch.status === "stuck" && original.status !== "stuck") {
            void logEvent("stuck", { problemId: id });
          }
          // 认知回看：降档 = 有进展，重排 = 还是难
          if (patch.hardReview && original.hardReview) {
            const diffDown = (patch.difficulty ?? 0) < (original.difficulty ?? 0);
            if (diffDown) {
              void logEvent("review-solved", { problemId: id });
            } else if (
              patch.hardReview.reviewCount > (original.hardReview.reviewCount ?? 0)
            ) {
              void logEvent("review-postpone", { problemId: id });
            }
          }
          if (patch.review && original.review) {
            const streakUp =
              (patch.review.streak ?? 0) > (original.review.streak ?? 0);
            if (streakUp) {
              void logEvent("review-solved", { problemId: id });
            } else if (patch.review.reviewCount > (original.review.reviewCount ?? 0)) {
              void logEvent("review-postpone", { problemId: id });
            }
          }
        }
      } catch (err) {
        commitProblems(prev);
        throw err;
      }
    },
    [commitProblems, sortProblems]
  );

  const deleteProblem = useCallback(
    async (id: string) => {
      await db.remove(STORES.PROBLEMS, id);
      void logEvent("delete", { problemId: id });
      commitProblems(problemsRef.current.filter((p) => p.id !== id));
    },
    [commitProblems]
  );

  const addMethod = useCallback(
    async (draft: Omit<Method, "id" | "createdAt" | "updatedAt">) => {
      const now = Date.now();
      const m: Method = {
        ...draft,
        id: newId(),
        createdAt: now,
        updatedAt: now,
        review: methodNeedsReview(draft.mastery?.level)
          ? methodInitialReview(draft.mastery?.level, now)
          : undefined,
      };
      await db.put(STORES.METHODS, m);
      void logEvent("add", { methodId: m.id });
      commitMethods([m, ...methodsRef.current]);
      return m;
    },
    [commitMethods]
  );

  const updateMethod = useCallback(
    async (id: string, patch: Partial<Omit<Method, "id">>) => {
      const prev = methodsRef.current;
      const now = Date.now();
      const original = prev.find((x) => x.id === id);
      const appliedPatch = { ...patch };
      if (original && "mastery" in patch) {
        const level = patch.mastery?.level ?? original.mastery?.level;
        if (methodNeedsReview(level)) {
          if (!original.review) appliedPatch.review = methodInitialReview(level, now);
        } else {
          appliedPatch.review = undefined;
        }
      }
      const next = sortMethods(
        prev.map((m) =>
          m.id === id ? { ...m, ...appliedPatch, updatedAt: now } : m
        )
      );
      const updated = next.find((m) => m.id === id);
      if (!updated) return;
      commitMethods(next);
      try {
        await db.put(STORES.METHODS, updated);
        if (original) {
          const levelUp =
            appliedPatch.mastery &&
            original.mastery &&
            (appliedPatch.mastery.level ?? 0) > (original.mastery.level ?? 0);
          if (appliedPatch.review === undefined && original.review) {
            void logEvent("review-solved", { methodId: id });
          } else if (levelUp) {
            void logEvent("review-solved", { methodId: id });
          } else if (
            appliedPatch.review &&
            original.review &&
            appliedPatch.review.reviewCount > (original.review.reviewCount ?? 0)
          ) {
            void logEvent("review-postpone", { methodId: id });
          }
        }
      } catch (err) {
        commitMethods(prev);
        throw err;
      }
    },
    [commitMethods, sortMethods]
  );

  const deleteMethod = useCallback(
    async (id: string) => {
      const prevProblems = problemsRef.current;
      const nextProblems = prevProblems.map((p) =>
        p.methodLinks.some((l) => l.methodId === id)
          ? {
              ...p,
              methodLinks: p.methodLinks.filter((l) => l.methodId !== id),
              updatedAt: Date.now(),
            }
          : p
      );
      const changed = nextProblems.filter((p, i) => p !== prevProblems[i]);
      await Promise.all([
        db.remove(STORES.METHODS, id),
        ...changed.map((p) => db.put(STORES.PROBLEMS, p)),
      ]);
      void logEvent("delete", { methodId: id });
      commitProblems(sortProblems(nextProblems));
      commitMethods(methodsRef.current.filter((m) => m.id !== id));
    },
    [commitProblems, commitMethods, sortProblems]
  );

  const importBackup = useCallback(
    async (
      problems: Problem[],
      methods: Method[],
      onProgress?: (done: number, total: number, label: string) => void
    ) => {
      const total = problems.length + methods.length;
      let done = 0;
      for (const p of problems) {
        await db.put(STORES.PROBLEMS, p);
        done += 1;
        onProgress?.(done, total, `正在写入题目 ${done}/${problems.length}`);
      }
      for (const m of methods) {
        await db.put(STORES.METHODS, m);
        done += 1;
        onProgress?.(done, total, `正在写入方法 ${done - problems.length}/${methods.length}`);
      }
      const [ps, ms] = await Promise.all([
        db.all<Problem>(STORES.PROBLEMS),
        db.all<Method>(STORES.METHODS),
      ]);
      commitProblems(
        ps.map(normalizeProblem).map((r) => r.p).sort((a, b) => b.updatedAt - a.updatedAt)
      );
      commitMethods(
        ms.map(normalizeMethod).map((r) => r.m).sort((a, b) => b.updatedAt - a.updatedAt)
      );
      return { problems: problems.length, methods: methods.length };
    },
    [commitProblems, commitMethods]
  );

  /** 替换导入：先清空全部题目与方法，再写入备份数据 */
  const replaceAll = useCallback(
    async (
      problems: Problem[],
      methods: Method[],
      onProgress?: (done: number, total: number, label: string) => void
    ) => {
      await db.clear(STORES.PROBLEMS);
      await db.clear(STORES.METHODS);
      const total = problems.length + methods.length;
      let done = 0;
      for (const p of problems) {
        await db.put(STORES.PROBLEMS, p);
        done += 1;
        onProgress?.(done, total, `正在写入题目 ${done}/${problems.length}`);
      }
      for (const m of methods) {
        await db.put(STORES.METHODS, m);
        done += 1;
        onProgress?.(done, total, `正在写入方法 ${done - problems.length}/${methods.length}`);
      }
      commitProblems(
        problems.map(normalizeProblem).map((r) => r.p).sort((a, b) => b.updatedAt - a.updatedAt)
      );
      commitMethods(
        methods.map(normalizeMethod).map((r) => r.m).sort((a, b) => b.updatedAt - a.updatedAt)
      );
      return { problems: problems.length, methods: methods.length };
    },
    [commitProblems, commitMethods]
  );

  /** 一键清空：删除全部题目、方法与事件日志 */
  const clearAll = useCallback(async () => {
    await Promise.all([
      db.clear(STORES.PROBLEMS),
      db.clear(STORES.METHODS),
      db.clear(STORES.EVENTS),
    ]);
    commitProblems([]);
    commitMethods([]);
  }, [commitProblems, commitMethods]);

  const renameTag = useCallback(
    async (oldName: string, newName: string) => {
      const name = newName.trim();
      if (!name || name === oldName) return;
      const nextProblems = problemsRef.current.map((p) =>
        p.tags.includes(oldName)
          ? { ...p, tags: p.tags.map((t) => (t === oldName ? name : t)), updatedAt: Date.now() }
          : p
      );
      const nextMethods = methodsRef.current.map((m) =>
        m.tags.includes(oldName)
          ? { ...m, tags: m.tags.map((t) => (t === oldName ? name : t)), updatedAt: Date.now() }
          : m
      );
      await Promise.all([
        ...nextProblems
          .filter((p, i) => p !== problemsRef.current[i])
          .map((p) => db.put(STORES.PROBLEMS, p)),
        ...nextMethods
          .filter((m, i) => m !== methodsRef.current[i])
          .map((m) => db.put(STORES.METHODS, m)),
      ]);
      commitProblems(sortProblems(nextProblems));
      commitMethods(sortMethods(nextMethods));
    },
    [commitProblems, commitMethods, sortProblems, sortMethods]
  );

  const deleteTag = useCallback(
    async (tag: string) => {
      const nextProblems = problemsRef.current.map((p) =>
        p.tags.includes(tag)
          ? { ...p, tags: p.tags.filter((t) => t !== tag), updatedAt: Date.now() }
          : p
      );
      const nextMethods = methodsRef.current.map((m) =>
        m.tags.includes(tag)
          ? { ...m, tags: m.tags.filter((t) => t !== tag), updatedAt: Date.now() }
          : m
      );
      await Promise.all([
        ...nextProblems
          .filter((p, i) => p !== problemsRef.current[i])
          .map((p) => db.put(STORES.PROBLEMS, p)),
        ...nextMethods
          .filter((m, i) => m !== methodsRef.current[i])
          .map((m) => db.put(STORES.METHODS, m)),
      ]);
      commitProblems(sortProblems(nextProblems));
      commitMethods(sortMethods(nextMethods));
    },
    [commitProblems, commitMethods, sortProblems, sortMethods]
  );

  const allTags = useMemo(() => {
    const map = new Map<string, TagStat>();
    for (const p of problems) {
      for (const t of p.tags) {
        const cur = map.get(t) ?? { name: t, problemCount: 0, methodCount: 0 };
        cur.problemCount += 1;
        map.set(t, cur);
      }
    }
    for (const m of methods) {
      for (const t of m.tags) {
        const cur = map.get(t) ?? { name: t, problemCount: 0, methodCount: 0 };
        cur.methodCount += 1;
        map.set(t, cur);
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
  }, [problems, methods]);

  return {
    ready,
    loadError,
    seeded,
    problems,
    methods,
    allTags,
    addProblem,
    updateProblem,
    deleteProblem,
    addMethod,
    updateMethod,
    deleteMethod,
    importBackup,
    replaceAll,
    clearAll,
    renameTag,
    deleteTag,
  };
}

type LegacyProblem = Omit<Problem, "solutions"> & {
  thoughtSteps?: ThoughtStep[];
  solutions?: ProblemSolution[];
};

function normalizeProblem(raw: Problem): ProblemRecord {
  const p = raw as LegacyProblem;
  const images = p.images ?? [];
  const solutionImages = images.filter((i) => i.kind === "solution");
  const problemImages = images.filter((i) => i.kind !== "solution");

  let solutions: ProblemSolution[];
  let solutionsMigrated = false;
  const normalizeSolution = (s: ProblemSolution): ProblemSolution => {
    const simplicity =
      s.simplicity === 1 || s.simplicity === 2 || s.simplicity === 3 ? s.simplicity : 2;
    const clever = s.clever === true;
    if (simplicity !== s.simplicity || clever !== s.clever) solutionsMigrated = true;
    return {
      id: s.id || uid(),
      label: s.label || "解法一",
      steps: (s.steps ?? []).map(toThoughtStep),
      image: s.image
        ? {
            id: s.image.id || uid(),
            caption: s.image.caption ?? "",
            blob: s.image.blob,
          }
        : null,
      simplicity,
      clever,
    };
  };
  if (Array.isArray(p.solutions) && p.solutions.length > 0) {
    solutions = p.solutions.map(normalizeSolution);
  } else {
    const first = solutionImages[0];
    solutions = [
      {
        id: uid(),
        label: "解法一",
        steps: (p.thoughtSteps ?? []).map(toThoughtStep),
        image: first
          ? { id: first.id, caption: first.caption ?? "", blob: first.blob }
          : null,
        simplicity: 2,
        clever: false,
      },
    ];
    solutionsMigrated = true;
  }

  let review = p.review;
  let migrated =
    solutionsMigrated ||
    !Array.isArray(p.solutions) ||
    !Array.isArray(p.images) ||
    !Array.isArray(p.methodLinks);
  if (p.status === "stuck" && (!review || !review.nextReviewAt)) {
    const base = p.updatedAt || Date.now();
    review = {
      stuckAt: base,
      nextReviewAt: base + REVIEW_SCHEDULE_DAYS[0] * 86400000,
      reviewCount: 0,
    };
    migrated = true;
  }

  const difficulty = p.difficulty >= 1 && p.difficulty <= 5 ? p.difficulty : 2;
  let feltHistory = p.feltHistory;
  let feltMigrated = false;
  if (!feltHistory || feltHistory.length === 0) {
    const legacyFelt =
      p.feltDifficulty && p.feltDifficulty >= 1 && p.feltDifficulty <= 5
        ? p.feltDifficulty
        : difficulty;
    feltHistory = [
      { at: p.createdAt || p.updatedAt || Date.now(), difficulty: legacyFelt },
    ];
    feltMigrated = true;
  }
  let hardReview = p.hardReview;
  let hardMigrated = false;
  if (difficulty >= 4) {
    if (!hardReview || !hardReview.nextReviewAt) {
      hardReview = hardInitialReview(p.updatedAt || Date.now());
      hardMigrated = true;
    } else if (hardReview.ease === undefined) {
      hardReview = { ...hardReview, ease: 1 };
      hardMigrated = true;
    }
  } else if (hardReview) {
    hardReview = undefined;
    hardMigrated = true;
  }
  migrated = migrated || hardMigrated || feltMigrated;

  const next: Problem = {
    ...p,
    methodLinks: p.methodLinks ?? [],
    images: problemImages,
    solutions,
    review,
    feltHistory,
    hardReview,
  };
  return { p: next, migrated };
}

function normalizeMethod(m: Method): MethodRecord {
  const mastery =
    m.mastery && m.mastery.level >= 1 && m.mastery.level <= 5
      ? {
          level: m.mastery.level as MethodMasteryLevel,
          updatedAt: m.mastery.updatedAt || 0,
        }
      : undefined;
  let review = m.review;
  let reviewMigrated = false;
  const level = mastery?.level;
  if (methodNeedsReview(level)) {
    if (!review || !review.nextReviewAt) {
      review = methodInitialReview(level, m.updatedAt || Date.now());
      reviewMigrated = true;
    } else if (review.ease === undefined) {
      review = { ...review, ease: 1 };
      reviewMigrated = true;
    }
  } else if (review) {
    review = undefined;
    reviewMigrated = true;
  }
  const next: Method = {
    ...m,
    steps: m.steps ?? [],
    pitfalls: m.pitfalls ?? "",
    images: m.images ?? [],
    mastery,
    review,
  };
  const migrated =
    !Array.isArray(m.steps) ||
    m.pitfalls === undefined ||
    !Array.isArray(m.images) ||
    Boolean(m.mastery && !mastery) ||
    reviewMigrated;
  return { m: next, migrated };
}
