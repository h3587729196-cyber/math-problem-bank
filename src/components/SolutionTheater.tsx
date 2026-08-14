import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Problem, ThoughtStep } from "../types";
import { CLEVERNESS_LABEL, SIMPLICITY_LABEL } from "../types";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { useMediaQuery } from "../hooks/useMediaQuery";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Sparkle,
  Star,
  X,
} from "./ui/icons";

interface SolutionTheaterProps {
  open: boolean;
  problem: Problem | null;
  onClose: () => void;
}

type Speed = "slow" | "normal" | "fast";
type Frame =
  | { kind: "problem"; title: string }
  | { kind: "step"; step: ThoughtStep };

const SPEED_MS: Record<Speed, number> = { slow: 4200, normal: 2600, fast: 1400 };

export function SolutionTheater({ open, problem, onClose }: SolutionTheaterProps) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const reduce = useReducedMotion();
  const [solutionIndex, setSolutionIndex] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>("normal");

  const sol = problem?.solutions[solutionIndex];
  const problemImage = problem?.images.find((i) => i.kind === "problem") ?? problem?.images[0];
  const problemUrl = useBlobUrl(problemImage?.blob);

  const frames = useMemo<Frame[]>(() => {
    if (!problem) return [];
    const list: Frame[] = [{ kind: "problem", title: "题干" }];
    for (const s of sol?.steps ?? []) list.push({ kind: "step", step: s });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem, solutionIndex]);

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(false);
  }, [open, solutionIndex]);

  useEffect(() => {
    if (!open || !playing || frameIndex >= frames.length - 1) return;
    const t = setTimeout(
      () => setFrameIndex((i) => Math.min(frames.length - 1, i + 1)),
      SPEED_MS[speed]
    );
    return () => clearTimeout(t);
  }, [open, playing, frameIndex, frames.length, speed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight")
        setFrameIndex((i) => Math.min(frames.length - 1, i + 1));
      if (e.key === "ArrowLeft") setFrameIndex((i) => Math.max(0, i - 1));
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, frames.length, frameIndex]);

  if (!problem) return null;

  const next = () => setFrameIndex((i) => Math.min(frames.length - 1, i + 1));
  const prev = () => setFrameIndex((i) => Math.max(0, i - 1));
  const ended = frameIndex >= frames.length - 1;
  const frame = frames[frameIndex];
  const pct = frames.length > 1 ? ((frameIndex + 1) / frames.length) * 100 : 100;
  const spring = reduce
    ? { duration: 0.12 }
    : { type: "spring" as const, bounce: 0.12, duration: 0.5 };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="theater-scrim"
            className="theater-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.12 } : { type: "spring", bounce: 0, duration: 0.3 }}
            onClick={onClose}
          />
          <motion.div
            key="theater-panel"
            className={`theater-panel ${desktop ? "right" : "bottom"}`}
            role="dialog"
            aria-modal="true"
            aria-label="解法剧场"
            initial={reduce ? { opacity: 0 } : desktop ? { x: "100%" } : { y: "100%" }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={reduce ? { opacity: 0 } : desktop ? { x: "100%" } : { y: "100%" }}
            transition={spring}
          >
            <header className="theater-head">
              <div className="theater-title-block">
                <span className="report-section-kicker">SOLUTION THEATER</span>
                <h2 className="theater-title">{problem.title || "未命名题目"}</h2>
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="关闭">
                <X />
              </button>
            </header>

            <div className="theater-solutions">
              {(problem.solutions ?? []).map((s, i) => (
                <button
                  key={s.id}
                  className={`chip theater-chip ${i === solutionIndex ? "active" : ""}`}
                  onClick={() => {
                    setSolutionIndex(i);
                    setPlaying(false);
                  }}
                >
                  {s.label || `解法 ${i + 1}`}
                  <span className={`badge simplicity s${s.simplicity ?? 2}`}>
                    {SIMPLICITY_LABEL[s.simplicity ?? 2]}
                  </span>
                  {s.clever === true && (
                    <span className="badge clever">
                      <Sparkle size={10} />
                      妙解
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="theater-stage">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${solutionIndex}-${frameIndex}`}
                  className="theater-frame"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, x: 28, scale: 0.985 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24, scale: 0.985 }}
                  transition={
                    reduce
                      ? { duration: 0.1 }
                      : { type: "spring", bounce: 0.1, duration: 0.55 }
                  }
                >
                  {frame.kind === "problem" ? (
                    <div className="theater-problem">
                      {problemUrl ? (
                        <img src={problemUrl} alt={frame.title} />
                      ) : (
                        <div className="theater-empty">本题没有题干图片</div>
                      )}
                      <p className="theater-frame-caption">{frame.title}</p>
                    </div>
                  ) : (
                    <div className="theater-step">
                      <span className="theater-step-num">
                        {frameIndex}
                        <small> / {frames.length - 1}</small>
                      </span>
                      <p className="theater-step-text">{frame.step.text}</p>
                      {frame.step.starred && (
                        <span className="cleverness-badge">
                          <Star size={11} />
                          {CLEVERNESS_LABEL[frame.step.cleverness]}
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="theater-progress" aria-label={`进度 ${Math.round(pct)}%`}>
              <motion.div
                className="theater-progress-fill"
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>

            <div className="theater-controls">
              <div className="theater-speeds" role="group" aria-label="播放速度">
                {(["slow", "normal", "fast"] as const).map((s) => (
                  <button
                    key={s}
                    className={speed === s ? "active" : ""}
                    onClick={() => setSpeed(s)}
                  >
                    {{ slow: "慢", normal: "正常", fast: "快" }[s]}
                  </button>
                ))}
              </div>
              <div className="theater-main-controls">
                <button className="icon-btn" onClick={prev} aria-label="上一步" disabled={frameIndex === 0}>
                  <ChevronLeft size={20} />
                </button>
                <button
                  className="theater-play"
                  aria-label={playing ? "暂停" : ended ? "重播" : "播放"}
                  onClick={() => {
                    if (ended) setFrameIndex(0);
                    setPlaying((v) => !v);
                  }}
                >
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <button
                  className="icon-btn"
                  onClick={next}
                  aria-label="下一步"
                  disabled={ended}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <span className="theater-counter">
                {frameIndex + 1} / {frames.length}
              </span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
