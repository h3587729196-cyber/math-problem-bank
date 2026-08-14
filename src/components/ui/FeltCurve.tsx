import type { FeltEntry } from "../../types";

/* ============================================================
 * 认知曲线：难度随时间的变化（每次认知回看记录一个点）
 * ========================================================== */

export function FeltCurve({
  history,
  height = 56,
}: {
  history: FeltEntry[];
  height?: number;
}) {
  const W = 100;
  const H = 36;
  const padX = 4;
  const padTop = 3;
  const padBottom = 3;
  const pts = [...history].sort((a, b) => a.at - b.at);

  const xOf = (i: number) =>
    pts.length === 1
      ? W / 2
      : padX + (i / (pts.length - 1)) * (W - padX * 2);
  const yOf = (d: number) =>
    padTop + ((5 - d) / 4) * (H - padTop - padBottom);

  if (pts.length === 0) return null;

  const line = pts.map((p, i) => xOf(i) + "," + yOf(p.difficulty)).join(" ");
  const area =
    "M" +
    xOf(0) +
    " " +
    (H - 1) +
    " L" +
    pts.map((p, i) => xOf(i) + " " + yOf(p.difficulty)).join(" L") +
    " L" +
    xOf(pts.length - 1) +
    " " +
    (H - 1) +
    " Z";

  return (
    <svg
      className="felt-curve"
      viewBox={"0 0 " + W + " " + H}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="felt-curve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#felt-curve-fill)" stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {pts.map((p, i) => (
        <circle
          key={i}
          cx={xOf(i)}
          cy={yOf(p.difficulty)}
          r={i === pts.length - 1 ? 2.4 : 1.5}
          fill={i === pts.length - 1 ? "currentColor" : "var(--surface)"}
          stroke="currentColor"
          strokeWidth="1.4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

/** 难度 → 中文标签 */
export const FELT_LABEL: Record<number, string> = {
  1: "简单",
  2: "中等",
  3: "较难",
  4: "困难",
  5: "极难",
};
