import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Problem, ProblemDraft } from "../types";
import {
  cognitiveRecord,
  hardInitialReview,
  perceivedDifficulty,
  predictIntervalDays,
  retrievability,
} from "../utils/review";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { Empty } from "./ui/Empty";
import { FeltCurve, FELT_LABEL } from "./ui/FeltCurve";
import { Check, Sparkle } from "./ui/icons";

interface HardReviewLibraryProps {
  problems: Problem[];
  onOpenProblem: (id: string) => void;
  onOpenImage: (src: string, caption: string) => void;
  onUpdateProblem: (id: string, patch: Partial<ProblemDraft>) => void;
}

const DAY = 86400000;
type Felt = 1 | 2 | 3 | 4 | 5;

export function HardReviewLibrary({
  problems,
  onOpenProblem,
  onOpenImage,
  onUpdateProblem,
}: HardReviewLibraryProps) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => Date.now());
  const [sessionDone, setSessionDone] = useState(0);
  const [lastGrade, setLastGrade] = useState<"good" | "again" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [felt, setFelt] = useState<Felt>(4);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 1900);
    return () => clearTimeout(t);
  }, [feedback]);

  const pool = useMemo(() => problems.filter((p) => p.difficulty >= 4), [problems]);

  const due = useMemo(
    () =>
      pool
        .filter((p) => (p.hardReview?.nextReviewAt ?? 0) <= now)
        .sort(
          (a, b) =>
            retrievability(a.hardReview ?? hardInitialReview(a.updatedAt), now) -
            retrievability(b.hardReview ?? hardInitialReview(b.updatedAt), now)
        ),
    [pool, now]
  );

  const upcoming = useMemo(
    () =>
      pool
        .filter((p) => (p.hardReview?.nextReviewAt ?? Infinity) > now)
        .sort((a, b) => (a.hardReview?.nextReviewAt ?? 0) - (b.hardReview?.nextReviewAt ?? 0)),
    [pool, now]
  );

  const current = due[0] ?? null;
  const nextItem = due[1] ?? null;
  const totalToday = sessionDone + due.length;

  // 当前卡变化时，把「这次觉得难度」重置为题目当前难度
  useEffect(() => {
    if (current) setFelt(current.difficulty as Felt);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const upcomingGroups = useMemo(() => {
    const groups = [
      { label: "明天", max: 1 },
      { label: "3 天内", max: 3 },
      { label: "一周内", max: 7 },
      { label: "更晚", max: Infinity },
    ];
    const buckets = groups.map((g) => ({ ...g, items: [] as Problem[] }));
    for (const p of upcoming) {
      const days = Math.max(1, Math.ceil(((p.hardReview?.nextReviewAt ?? 0) - now) / DAY));
      const bucket = buckets.find((g) => days <= g.max);
      if (bucket) bucket.items.push(p);
    }
    return buckets.filter((g) => g.items.length > 0);
  }, [upcoming, now]);

  /** 记录本次回看觉得的难度并安排下次（EWMA 感知平滑 + 渐进调档） */
  const record = (p: Problem) => {
    const r = p.hardReview ?? hardInitialReview(now);
    const prevFelt = p.feltHistory?.length
      ? p.feltHistory[p.feltHistory.length - 1].difficulty
      : p.difficulty;
    const history = [...(p.feltHistory ?? []), { at: now, difficulty: felt }];
    const res = cognitiveRecord(p.difficulty, felt, r, now, prevFelt);
    setLastGrade(res.difficulty < p.difficulty ? "good" : "again");
    setSessionDone((c) => c + 1);
    onUpdateProblem(p.id, {
      difficulty: res.difficulty,
      feltHistory: history,
      hardReview: res.review,
    });
    const days = res.review
      ? Math.max(1, Math.ceil((res.review.nextReviewAt - now) / DAY))
      : 0;
    if (res.difficulty < p.difficulty) {
      setFeedback(
        res.difficulty < 4
          ? "难度 " + p.difficulty + " → " + res.difficulty + " · 已毕业，不再打扰"
          : "难度 " + p.difficulty + " → " + res.difficulty + " · " + days + " 天后"
      );
    } else if (res.difficulty > p.difficulty) {
      setFeedback("难度 " + p.difficulty + " → " + res.difficulty + " · 变难了 · " + days + " 天后");
    } else {
      setFeedback("还是难 · " + days + " 天后再见");
    }
  };

  const nextSummary = useMemo(() => {
    if (upcomingGroups[0]) return "明天 " + upcomingGroups[0].items.length + " 道";
    return "没有待复习的难题了";
  }, [upcomingGroups]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">认知回看</h1>
          <p className="page-sub">
            难度 4–5 的题按记忆曲线排期；每次回看记录「现在觉得的难度」，画出你的认知曲线。
          </p>
        </div>
      </div>

      {pool.length === 0 ? (
        <Empty
          icon={<Sparkle size={28} />}
          title="没有待认知回看的难题"
          description="难度 4–5 的题目会自动进入这里，按科学间隔提醒你回看。"
        />
      ) : (
        <div className="review-sections">
          <section className="review-section">
            {current ? (
              <div className="review-session">
                <div className="review-progress">
                  <div className="review-progress-track">
                    <motion.div
                      className="review-progress-fill"
                      initial={false}
                      animate={{ width: (sessionDone / Math.max(1, totalToday)) * 100 + "%" }}
                      transition={{ type: "spring", stiffness: 210, damping: 28 }}
                    />
                  </div>
                  <span className="muted">
                    第 {sessionDone + 1} / {totalToday} 张
                  </span>
                </div>
                <div className="review-stage">
                  {nextItem && <div className="review-stack-next" aria-hidden="true" />}
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div
                      key={current.id}
                      className="review-card hard-review-card"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 76, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={
                        reduce
                          ? { opacity: 0 }
                          : lastGrade === "good"
                            ? { y: -180, scale: 1.03, opacity: 0 }
                            : { x: -150, y: 60, rotate: -7, opacity: 0 }
                      }
                      transition={{ type: "spring", stiffness: 300, damping: 29 }}
                    >
                      <HardCard
                        p={current}
                        now={now}
                        felt={felt}
                        onFelt={setFelt}
                        onOpen={() => onOpenProblem(current.id)}
                        onOpenImage={onOpenImage}
                        onRecord={() => record(current)}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div className="review-feedback" aria-live="polite">
                  <AnimatePresence>
                    {feedback && (
                      <motion.div
                        key={feedback + sessionDone}
                        className="review-feedback-chip"
                        initial={{ opacity: 0, y: 10, scale: 0.92 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 26 }}
                      >
                        <Check size={14} />
                        {feedback}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : sessionDone > 0 ? (
              <div className="review-done">
                <DoneCheck reduce={reduce} />
                <h3>今日认知回看完成</h3>
                <p className="muted">共完成 {sessionDone} 张 · {nextSummary}</p>
              </div>
            ) : (
              <p className="field-hint">暂时没有到期的难题，过几天再来看看。</p>
            )}
          </section>

          {upcomingGroups.length > 0 && (
            <section className="review-section">
              <header className="review-section-head">
                <span className="chip">还没到期</span>
                <span className="muted">{upcoming.length} 道</span>
              </header>
              <div className="review-upcoming-groups">
                {upcomingGroups.map((g) => (
                  <div key={g.label} className="review-upcoming-group">
                    <span className="review-upcoming-group-label">{g.label}</span>
                    {g.items.map((p) => {
                      const days = Math.max(
                        1,
                        Math.ceil(((p.hardReview?.nextReviewAt ?? 0) - now) / DAY)
                      );
                      return (
                        <button
                          key={p.id}
                          className="review-upcoming-row"
                          onClick={() => onOpenProblem(p.id)}
                        >
                          <span className="review-upcoming-title">
                            {p.title || "未命名题目"} · 难度 {p.difficulty}
                          </span>
                          <span className="muted">{days} 天后回看</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function HardCard({
  p,
  now,
  felt,
  onFelt,
  onOpen,
  onOpenImage,
  onRecord,
}: {
  p: Problem;
  now: number;
  felt: Felt;
  onFelt: (f: Felt) => void;
  onOpen: () => void;
  onOpenImage: (src: string, caption: string) => void;
  onRecord: () => void;
}) {
  const imgUrl = useBlobUrl(p.images.find((i) => i.kind === "problem")?.blob);
  const r = p.hardReview;
  const rNow = r ? retrievability(r, now) : 1;
  const tone = rNow >= 0.7 ? "good" : rNow >= 0.4 ? "mid" : "bad";
  const history = p.feltHistory ?? [];
  const lastFelt = history.length ? history[history.length - 1].difficulty : p.difficulty;
  const trend = felt - p.difficulty;
  const predicted = perceivedDifficulty(p.difficulty, felt);
  const againDays = r ? predictIntervalDays(r, "again", now) : 1;
  const goodDays = r ? predictIntervalDays(r, "good", now) : 2;
  const overdue =
    r && r.nextReviewAt <= now ? Math.max(1, Math.floor((now - r.nextReviewAt) / DAY)) : 0;

  return (
    <>
      <button
        className="review-card-tap"
        onClick={onOpen}
        aria-label={"打开题目：" + (p.title || "")}
      >
        {imgUrl && (
          <img
            className="review-card-img"
            src={imgUrl}
            alt="题干"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onOpenImage(imgUrl, p.title || "题干");
            }}
          />
        )}
        <div className="review-card-body">
          <div className="review-card-top">
            <span className="badge stuck">难度 {p.difficulty}</span>
            <span className="muted">上次觉得：{FELT_LABEL[lastFelt]}</span>
            {overdue > 0 && <span className="badge overdue">逾期 {overdue} 天</span>}
          </div>
          <h3 className="review-card-title">{p.title || "未命名题目"}</h3>
          <div className="felt-panel">
            <div className="felt-panel-head">
              <span className="muted">认知曲线</span>
              <span className="muted">{history.length} 次记录</span>
            </div>
            <FeltCurve history={history} height={54} />
            <div className="felt-panel-legend">
              <span>5 极难</span>
              <span>1 简单</span>
            </div>
          </div>
          <div className="review-retention">
            <div className="review-retention-head">
              <span className="muted">记忆强度</span>
              <span className={"review-retention-val " + tone}>{Math.round(rNow * 100)}%</span>
            </div>
            <div className="review-retention-track">
              <motion.div
                className={"review-retention-fill " + tone}
                initial={false}
                animate={{ width: Math.max(4, rNow * 100) + "%" }}
                transition={{ type: "spring", stiffness: 120, damping: 22 }}
              />
            </div>
          </div>
        </div>
      </button>
      <div className="felt-row">
        <span className="felt-row-label">这次觉得难度</span>
        <div className="felt-dots">
          {([1, 2, 3, 4, 5] as Felt[]).map((n) => (
            <button
              key={n}
              className={"felt-dot" + (n <= felt ? " on" : "")}
              onClick={() => onFelt(n)}
              aria-label={"觉得难度 " + n}
              aria-pressed={n === felt}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="review-actions review-grade-row">
        <button className="btn btn-primary grade-btn grow-2" onClick={onRecord}>
          <b>
            {trend < 0 ? "记录 · 变简单了" : trend > 0 ? "记录 · 变难了" : "记录 · 和上次一样"}
          </b>
          <span>
            {predicted < p.difficulty
              ? predicted < 4
                ? "毕业 · 不再打扰"
                : goodDays + " 天后"
              : againDays + " 天后"}
          </span>
        </button>
      </div>
    </>
  );
}

function DoneCheck({ reduce }: { reduce: boolean | null }) {
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <div className="review-done-ring">
      <svg width="112" height="112" viewBox="0 0 112 112">
        <circle className="review-ring-track" cx="56" cy="56" r={R} />
        <motion.circle
          className="review-ring-fill done"
          cx="56"
          cy="56"
          r={R}
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 18 }}
        />
      </svg>
      <motion.svg
        className="review-done-check"
        width="44"
        height="44"
        viewBox="0 0 24 24"
        initial={false}
      >
        <motion.path
          d="M4.5 12.5l5 5L19.5 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={
            reduce ? { duration: 0 } : { delay: 0.25, duration: 0.45, ease: "easeOut" }
          }
        />
      </motion.svg>
    </div>
  );
}
