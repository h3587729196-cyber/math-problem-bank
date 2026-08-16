import type { CSSProperties } from "react";

/* ============================================================
 * Skeleton · 流光骨架屏（加载态的高级化）
 * ============================================================ */

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** 题库卡片网格骨架屏 */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid" aria-label="正在加载题库">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card skeleton-card">
          <Skeleton className="thumb" style={{ aspectRatio: "16 / 9" }} />
          <div className="card-body">
            <Skeleton className="line" style={{ width: "78%" }} />
            <Skeleton className="line" style={{ width: "52%" }} />
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Skeleton className="line" style={{ width: "34%", height: 18 }} />
              <Skeleton className="line" style={{ width: "22%", height: 18 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
