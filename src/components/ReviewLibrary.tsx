import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Method, MethodMasteryLevel, Problem, ProblemDraft } from "../types";
import { MASTERY_LABEL, SIMPLICITY_LABEL, STATUS_LABEL } from "../types";
import {
  advanceReview,
  methodInitialReview,
  methodNeedsReview,
  predictIntervalDays,
  problemInitialReview,
  retrievability,
  type ReviewGrade,
} from "../utils/review";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { Empty } from "./ui/Empty";
import { Segmented } from "./ui/Segmented";
import { Bulb, Check, Clock } from "./ui/icons";

interface ReviewLibraryProps {
  problems: Problem[];
  methods: Method[];
  onOpenProblem: (id: string) => void;
  onOpenMethod: (id: string) => void;
  onUpdateProblem: (id: string, patch: Partial<ProblemDraft>) => void;
  onUpdateMethod: (id: string, patch: Partial<Method>) => void;
}

const DAY = 86400000;
const THINK_SECONDS = 20;
type Tab = "problems" | "methods";
type Phase = "think" | "ready" | "revealed";

export function ReviewLibrary({
  problems,
  methods,
  onOpenProblem,
  onOpenMethod,
  onUpdateProblem,
  onUpdateMethod,
}: ReviewLibraryProps) {
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<Tab>("problems");
  const [now, setNow] = useState(() => Date.now());
  const [sessionDone, setSessionDone] = useState(0);
  const [lastGrade, setLastGrade] = useState<ReviewGrade | "done" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("think");
  const [remaining, setRemaining] = useState(THINK_SECONDS);
  const doneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // 评分反馈自动消失
  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 1800);
    return () => clearTimeout(t);
  }, [feedback]);

  useEffect(() => {
    setSessionDone(0);
    setFeedback(null);
  }, [tab]);

  const stuck = useMemo(() => problems.filter((p) => p.status === "stuck"), [problems]);
  const reviewMethods = useMemo(
    () => methods.filter((m) => methodNeedsReview(m.mastery?.level)),
    [methods]
  );

  const problemDue = useMemo(
    () =>
      stuck
        .filter((p) => (p.review?.nextReviewAt ?? p.updatedAt) <= now)
        .sort(
          (a, b) =>
            retrievability(a.review ?? problemInitialReview(a.difficulty, a.updatedAt), now) -
            retrievability(b.review ?? problemInitialReview(b.difficulty, b.updatedAt), now)
        ),
    [stuck, now]
  );
  const problemUpcoming = useMemo(
    () =>
      stuck
        .filter((p) => (p.review?.nextReviewAt ?? Infinity) > now)
        .sort((a, b) => (a.review?.nextReviewAt ?? 0) - (b.review?.nextReviewAt ?? 0)),
    [stuck, now]
  );
  const methodDue = useMemo(
    () =>
      reviewMethods
        .filter((m) => (m.review?.nextReviewAt ?? 0) <= now)
        .sort(
          (a, b) =>
            retrievability(a.review ?? methodInitialReview(a.mastery?.level, a.updatedAt), now) -
            retrievability(b.review ?? methodInitialReview(b.mastery?.level, b.updatedAt), now)
        ),
    [reviewMethods, now]
  );
  const methodUpcoming = useMemo(
    () =>
      reviewMethods
        .filter((m) => (m.review?.nextReviewAt ?? Infinity) > now)
        .sort((a, b) => (a.review?.nextReviewAt ?? 0) - (b.review?.nextReviewAt ?? 0)),
    [reviewMethods, now]
  );

  const queue = tab === "problems" ? problemDue : methodDue;
  const upcoming = tab === "problems" ? problemUpcoming : methodUpcoming;
  const current = queue[0] ?? null;
  const nextItem = queue[1] ?? null;
  const totalToday = sessionDone + queue.length;

  /* ---------- 强制思考 20 秒 ---------- */
  const currentKey = current?.id ?? "";
  useEffect(() => {
    setPhase("think");
    setRemaining(THINK_SECONDS);
  }, [currentKey, tab]);

  useEffect(() => {
    if (phase !== "think") return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setPhase("ready");
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const reveal = () => setPhase("revealed");

  // 演示模式 API：F9 演示序列调用揭晓与切换标签
  useEffect(() => {
    const w = window as unknown as { __demoApi?: Record<string, () => void> };
    w.__demoApi = w.__demoApi ?? {};
    w.__demoApi.reviewReveal = reveal;
    w.__demoApi.reviewShowMethods = () => setTab("methods");
    return () => {
      delete w.__demoApi?.reviewReveal;
      delete w.__demoApi?.reviewShowMethods;
    };
  }, []);

  /* ---------- 评分 ---------- */
  const gradeProblem = (p: Problem, g: ReviewGrade) => {
    const r = p.review ?? problemInitialReview(p.difficulty, now);
    setLastGrade(g);
    setSessionDone((c) => c + 1);
    if (g === "good") {
      const streak = (r.streak ?? 0) + 1;
      if (streak >= 3) {
        onUpdateProblem(p.id, { status: "solved", review: undefined });
        setFeedback("连续 3 次做对 · 已毕业标记为「已解」");
        return;
      }
      const days = predictIntervalDays(r, "good", now);
      onUpdateProblem(p.id, { review: advanceReview(r, "good", now) });
      setFeedback("已安排 · " + days + " 天后 · 目标强度 90%");
      return;
    }
    const days = predictIntervalDays(r, g, now);
    onUpdateProblem(p.id, { review: advanceReview(r, g, now) });
    setFeedback(g === "again" ? "忘了没关系 · 明天再见一次" : "已安排 · " + days + " 天后");
  };

  const gradeMethod = (m: Method, g: "good" | "again") => {
    const r = m.review ?? methodInitialReview(m.mastery?.level, now);
    setLastGrade(g === "good" ? "good" : "again");
    setSessionDone((c) => c + 1);
    if (g === "good") {
      const level = (m.mastery?.level ?? 1) as MethodMasteryLevel;
      const nextLevel = Math.min(5, level + 1) as MethodMasteryLevel;
      const days = predictIntervalDays(r, "good", now);
      onUpdateMethod(m.id, {
        mastery: { level: nextLevel, updatedAt: now },
        review: nextLevel >= 3 ? undefined : advanceReview(r, "good", now),
      });
      setFeedback(
        nextLevel >= 3
          ? "升到「熟练」· 已毕业离开回看池"
          : "掌握度 → " + MASTERY_LABEL[nextLevel] + " · " + days + " 天后"
      );
      return;
    }
    const days = predictIntervalDays(r, "again", now);
    onUpdateMethod(m.id, { review: advanceReview(r, "again", now) });
    setFeedback("还没掌握 · " + days + " 天后再来");
  };

  /* ---------- 即将到期分组 ---------- */
  const upcomingGroups = useMemo(() => {
    const groups = [
      { label: "明天", max: 1 },
      { label: "3 天内", max: 3 },
      { label: "一周内", max: 7 },
      { label: "更晚", max: Infinity },
    ];
    const buckets = groups.map((g) => ({ ...g, items: [] as (Problem | Method)[] }));
    for (const x of upcoming) {
      const next = x.review?.nextReviewAt ?? 0;
      const days = Math.max(1, Math.ceil((next - now) / DAY));
      const bucket = buckets.find((g) => days <= g.max);
      if (bucket) bucket.items.push(x);
    }
    return buckets.filter((g) => g.items.length > 0);
  }, [upcoming, now]);

  const nextSummary = useMemo(() => {
    const parts: string[] = [];
    if (upcomingGroups[0] && tab === "problems") {
      parts.push("明天 " + upcomingGroups[0].items.length + " 题");
    }
    if (upcomingGroups[0] && tab === "methods") {
      parts.push("明天 " + upcomingGroups[0].items.length + " 个方法");
    }
    if (upcomingGroups[1]) {
      parts.push("3 天内还有 " + upcomingGroups[1].items.length + " 项");
    }
    return parts.join(" · ") || "没有待复习的了";
  }, [upcomingGroups, tab]);

  const scrollToDone = () => {
    doneRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">回看</h1>
          <p className="page-sub">
            先自己想 20 秒再揭晓答案；按记忆曲线排期，忘了的明天再来，连续做对 3 次即毕业。
          </p>
        </div>
        <ProgressRing done={sessionDone} total={totalToday} />
      </div>

      <div className="review-tabs">
        <Segmented
          id="review-tab"
          value={tab}
          options={[
            { value: "problems", label: "题目（" + stuck.length + "）" },
            { value: "methods", label: "方法（" + reviewMethods.length + "）" },
          ]}
          onChange={(v) => setTab(v as Tab)}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={reduce ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
        >
          {tab === "problems" ? (
            stuck.length === 0 ? (
              <Empty
                icon={<Clock size={28} />}
                title="没有卡住的题"
                description="把题目标记为「卡住」后，这里会自动安排回看时间。"
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
                            key={(current as Problem).id}
                            className="review-card"
                            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 76, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={
                              reduce
                                ? { opacity: 0 }
                                : lastGrade === "good"
                                  ? { y: -180, scale: 1.03, opacity: 0 }
                                  : lastGrade === "hard"
                                    ? { y: 60, scale: 0.95, opacity: 0 }
                                    : { x: -150, y: 60, rotate: -7, opacity: 0 }
                            }
                            transition={{ type: "spring", stiffness: 300, damping: 29 }}
                          >
                            <ProblemCard
                              p={current as Problem}
                              now={now}
                              phase={phase}
                              remaining={remaining}
                              onReveal={reveal}
                              onOpen={() => onOpenProblem((current as Problem).id)}
                              onGrade={(g) => gradeProblem(current as Problem, g)}
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
                    <div className="review-done" ref={doneRef}>
                      <DoneRing reduce={reduce} />
                      <h3>今日复习完成</h3>
                      <p className="muted">
                        共完成 {sessionDone} 张 · {nextSummary}
                      </p>
                      {upcomingGroups.length > 0 && (
                        <button className="btn btn-ghost" onClick={scrollToDone}>
                          查看日程
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="field-hint">暂时没有到期的题，过几天再来看看。</p>
                  )}
                </section>

                {upcomingGroups.length > 0 && (
                  <section className="review-section" ref={tab === "problems" ? doneRef : undefined}>
                    <header className="review-section-head">
                      <span className="chip">还没到期</span>
                      <span className="muted">{upcoming.length} 道</span>
                    </header>
                    <div className="review-upcoming-groups">
                      {upcomingGroups.map((g) => (
                        <div key={g.label} className="review-upcoming-group">
                          <span className="review-upcoming-group-label">{g.label}</span>
                          {g.items.map((p) => {
                            const r = p.review;
                            const days = r
                              ? Math.max(1, Math.ceil((r.nextReviewAt - now) / DAY))
                              : 1;
                            return (
                              <button
                                key={p.id}
                                className="review-upcoming-row"
                                onClick={() => onOpenProblem(p.id)}
                              >
                                <span className="review-upcoming-title">
                                  {"title" in p ? p.title || "未命名题目" : p.name}
                                </span>
                                <span className="review-upcoming-strength">
                                  <i className="dot-on" />
                                  90%
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
            )
          ) : reviewMethods.length === 0 ? (
            <Empty
              icon={<Bulb size={28} />}
              title="方法都达到熟练了"
              description="掌握度低于「熟练」的方法会自动进入这里回看，直到升到熟练。"
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
                        第 {sessionDone + 1} / {totalToday} 个
                      </span>
                    </div>
                    <div className="review-stage">
                      {nextItem && <div className="review-stack-next" aria-hidden="true" />}
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.div
                          key={(current as Method).id}
                          className="review-card method-review-card"
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
                          <MethodCard
                            m={current as Method}
                            now={now}
                            phase={phase}
                            remaining={remaining}
                            onReveal={reveal}
                            linked={problems.filter((p) =>
                              p.methodLinks?.some((l) => l.methodId === (current as Method).id)
                            ).length}
                            onOpen={() => onOpenMethod((current as Method).id)}
                            onGrade={(g) => gradeMethod(current as Method, g)}
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
                  <div className="review-done" ref={doneRef}>
                    <DoneRing reduce={reduce} />
                    <h3>今日方法复习完成</h3>
                    <p className="muted">
                      共完成 {sessionDone} 个 · {nextSummary}
                    </p>
                    {upcomingGroups.length > 0 && (
                      <button className="btn btn-ghost" onClick={scrollToDone}>
                        查看日程
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="field-hint">方法暂时没有到期的，过几天再来看看。</p>
                )}
              </section>

              {upcomingGroups.length > 0 && (
                <section className="review-section">
                  <header className="review-section-head">
                    <span className="chip">还没到期</span>
                    <span className="muted">{upcoming.length} 个</span>
                  </header>
                  <div className="review-upcoming-groups">
                    {upcomingGroups.map((g) => (
                      <div key={g.label} className="review-upcoming-group">
                        <span className="review-upcoming-group-label">{g.label}</span>
                        {g.items.map((m) => {
                          const r = m.review;
                          const days = r
                            ? Math.max(1, Math.ceil((r.nextReviewAt - now) / DAY))
                            : 1;
                          return (
                            <button
                              key={m.id}
                              className="review-upcoming-row"
                              onClick={() => onOpenMethod(m.id)}
                            >
                              <span className="review-upcoming-title">
                                {"name" in m ? m.name : m.title || "未命名题目"}
                              </span>
                              <span className="review-upcoming-strength">
                                <i className="dot-on" />
                                90%
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
        </motion.div>
      </AnimatePresence>
    </>
  );
}

/* ---------- 思考倒计时面板 ---------- */

function ThinkPanel({ remaining, cardKey }: { remaining: number; cardKey: string }) {
  const R = 28;
  const C = 2 * Math.PI * R;
  return (
    <div className="think-phase">
      <div className="think-ring">
        <svg width="70" height="70" viewBox="0 0 70 70">
          <circle className="review-ring-track" cx="35" cy="35" r={R} />
          <motion.circle
            key={cardKey}
            className="think-ring-fill"
            cx="35"
            cy="35"
            r={R}
            strokeDasharray={C}
            initial={{ strokeDashoffset: 0 }}
            animate={{ strokeDashoffset: C }}
            transition={{ duration: 20, ease: "linear" }}
          />
        </svg>
        <span className="think-num">{remaining}</span>
      </div>
      <div className="think-text">
        <b>先自己想 20 秒</b>
        <span>切入点是什么？该用哪招？上次卡在哪？</span>
      </div>
    </div>
  );
}

/* ---------- 题目卡 ---------- */

function ProblemCard({
  p,
  now,
  phase,
  remaining,
  onReveal,
  onOpen,
  onGrade,
}: {
  p: Problem;
  now: number;
  phase: Phase;
  remaining: number;
  onReveal: () => void;
  onOpen: () => void;
  onGrade: (g: ReviewGrade) => void;
}) {
  const imgUrl = useBlobUrl(p.images.find((i) => i.kind === "problem")?.blob);
  const r = p.review;
  const rNow = r ? retrievability(r, now) : 1;
  const tone = rNow >= 0.7 ? "good" : rNow >= 0.4 ? "mid" : "bad";
  const againDays = r ? predictIntervalDays(r, "again", now) : 1;
  const hardDays = r ? predictIntervalDays(r, "hard", now) : 1;
  const goodDays = r ? predictIntervalDays(r, "good", now) : 2;
  const streak = r?.streak ?? 0;
  const overdue =
    r && r.nextReviewAt <= now ? Math.max(1, Math.floor((now - r.nextReviewAt) / DAY)) : 0;
  const round = (r?.reviewCount ?? 0) + 1;

  return (
    <>
      <button
        className="review-card-tap"
        onClick={onOpen}
        aria-label={"打开题目：" + (p.title || "")}
      >
        {imgUrl && <img className="review-card-img" src={imgUrl} alt="题干" />}
        <div className="review-card-body">
          <div className="review-card-top">
            <span className="badge stuck">{STATUS_LABEL.stuck}</span>
            {overdue > 0 && <span className="badge overdue">逾期 {overdue} 天</span>}
            <span className="muted">第 {round} 轮</span>
          </div>
          <h3 className="review-card-title">{p.title || "未命名题目"}</h3>
          {phase === "revealed" && <ProblemAnswer p={p} />}
        </div>
      </button>

      {phase === "think" && <ThinkPanel remaining={remaining} cardKey={p.id} />}

      {phase === "ready" && (
        <div className="review-ready">
          <p className="muted">20 秒到了，想好了吗？</p>
          <button className="btn btn-primary review-reveal-btn" onClick={onReveal}>
            查看答案
          </button>
        </div>
      )}

      {phase === "revealed" && (
        <>
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
          {p.tags.length > 0 && (
            <div className="card-tags">
              {p.tags.slice(0, 4).map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="review-actions review-grade-row">
            <button className="btn btn-danger grade-btn" onClick={() => onGrade("again")}>
              <b>忘了</b>
              <span>{againDays} 天后</span>
            </button>
            <button className="btn btn-ghost grade-btn" onClick={() => onGrade("hard")}>
              <b>有点模糊</b>
              <span>{hardDays} 天后</span>
            </button>
            <button className="btn btn-primary grade-btn" onClick={() => onGrade("good")}>
              <b>{streak >= 2 ? "做出来了 · 毕业" : "做出来了"}</b>
              <span>{streak >= 2 ? "连续 3 次" : goodDays + " 天后"}</span>
            </button>
          </div>
          {streak > 0 && (
            <div className="review-streak">
              {[1, 2, 3].map((n) => (
                <i key={n} className={n <= streak ? "on" : ""} />
              ))}
              <span className="muted">连续做对 {streak}/3 次后毕业为「已解」</span>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ---------- 答案区（题目） ---------- */

function ProblemAnswer({ p }: { p: Problem }) {
  const sols = p.solutions ?? [];
  const legacy = p.thoughtSteps ?? [];
  if (sols.length === 0 && legacy.length === 0) {
    return (
      <p className="review-answer-empty">
        暂无解法记录——点击上方题干打开详情，把思路补进去。
      </p>
    );
  }
  return (
    <div className="review-answer">
      {sols.map((s) => (
        <div key={s.id} className="review-answer-sol">
          <div className="review-answer-sol-head">
            <b>{s.label || "解法"}</b>
            <span className="muted">{SIMPLICITY_LABEL[s.simplicity]}</span>
            {s.clever && <span className="badge todo">妙解</span>}
          </div>
          <ol className="review-answer-steps">
            {s.steps.map((st) => (
              <li key={st.id}>{st.text}</li>
            ))}
          </ol>
        </div>
      ))}
      {sols.length === 0 && legacy.length > 0 && (
        <ol className="review-answer-steps">
          {legacy.map((st) => (
            <li key={st.id}>{st.text}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ---------- 方法卡 ---------- */

function MethodCard({
  m,
  now,
  phase,
  remaining,
  onReveal,
  linked,
  onOpen,
  onGrade,
}: {
  m: Method;
  now: number;
  phase: Phase;
  remaining: number;
  onReveal: () => void;
  linked: number;
  onOpen: () => void;
  onGrade: (g: "good" | "again") => void;
}) {
  const r = m.review;
  const rNow = r ? retrievability(r, now) : 1;
  const tone = rNow >= 0.7 ? "good" : rNow >= 0.4 ? "mid" : "bad";
  const level = (m.mastery?.level ?? 1) as MethodMasteryLevel;
  const nextLevel = Math.min(5, level + 1) as MethodMasteryLevel;
  const goodDays = r ? predictIntervalDays(r, "good", now) : 1;
  const againDays = r ? predictIntervalDays(r, "again", now) : 1;
  const overdue =
    r && r.nextReviewAt <= now ? Math.max(1, Math.floor((now - r.nextReviewAt) / DAY)) : 0;

  return (
    <>
      <button className="review-card-tap" onClick={onOpen} aria-label={"打开方法：" + m.name}>
        <div className="review-card-body">
          <div className="review-card-top">
            <span className={"badge mastery lv" + level}>{MASTERY_LABEL[level]}</span>
            {overdue > 0 && <span className="badge overdue">逾期 {overdue} 天</span>}
            <span className="muted">关联 {linked} 题</span>
          </div>
          <h3 className="review-card-title">{m.name}</h3>
          <div className="mastery-progress">
            <span className="mastery-progress-label">向「熟练」推进</span>
            <div className="mastery-dots">
              {[1, 2, 3, 4, 5].map((n) => (
                <i key={n} className={n <= level ? "on" : ""} />
              ))}
            </div>
            <span className="muted">下一步：{MASTERY_LABEL[nextLevel]}</span>
          </div>
          {phase === "revealed" && <MethodAnswer m={m} />}
        </div>
      </button>

      {phase === "think" && <ThinkPanel remaining={remaining} cardKey={m.id} />}

      {phase === "ready" && (
        <div className="review-ready">
          <p className="muted">20 秒到了，能说出这招的信号吗？</p>
          <button className="btn btn-primary review-reveal-btn" onClick={onReveal}>
            查看答案
          </button>
        </div>
      )}

      {phase === "revealed" && (
        <>
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
          <div className="review-actions review-grade-row">
            <button className="btn btn-danger grade-btn" onClick={() => onGrade("again")}>
              <b>还没掌握</b>
              <span>{againDays} 天后</span>
            </button>
            <button className="btn btn-primary grade-btn grow-2" onClick={() => onGrade("good")}>
              <b>掌握提升了（{MASTERY_LABEL[nextLevel]}）</b>
              <span>{goodDays} 天后</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

/* ---------- 答案区（方法） ---------- */

function MethodAnswer({ m }: { m: Method }) {
  return (
    <div className="review-answer">
      {m.signal && (
        <div className="review-answer-sol">
          <div className="review-answer-sol-head">
            <b>适用信号</b>
          </div>
          <p className="review-answer-text">{m.signal}</p>
        </div>
      )}
      {m.steps.length > 0 && (
        <div className="review-answer-sol">
          <div className="review-answer-sol-head">
            <b>操作步骤</b>
          </div>
          <ol className="review-answer-steps">
            {m.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      {m.pitfalls && (
        <div className="review-answer-sol">
          <div className="review-answer-sol-head">
            <b>易错点</b>
          </div>
          <p className="review-answer-text">{m.pitfalls}</p>
        </div>
      )}
    </div>
  );
}

/* ---------- 进度环 ---------- */

function ProgressRing({ done, total }: { done: number; total: number }) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const ratio = total > 0 ? done / total : 0;
  return (
    <div className="review-ring" aria-label={"今日进度 " + done + "/" + total}>
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle className="review-ring-track" cx="32" cy="32" r={R} />
        <motion.circle
          className="review-ring-fill"
          cx="32"
          cy="32"
          r={R}
          strokeDasharray={C}
          initial={false}
          animate={{ strokeDashoffset: C * (1 - ratio) }}
          transition={{ type: "spring", stiffness: 110, damping: 22 }}
        />
      </svg>
      <span className="review-ring-num">{total > 0 ? done + "/" + total : "✓"}</span>
    </div>
  );
}

/* ---------- 完成态 ---------- */

function DoneRing({ reduce }: { reduce: boolean | null }) {
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
