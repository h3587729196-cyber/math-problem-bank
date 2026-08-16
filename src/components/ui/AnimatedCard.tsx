import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTilt } from "../../hooks/useTilt";

/* ============================================================
 * AnimatedCard · 网格卡片的统一动效
 *
 * 把入场 / 退场 / 归位(布局) / 3D 倾斜 / 键盘可达 / 减动效降级
 * 全部收敛到一处，保证题库、方法库、巧思库的卡片动效一致且丝滑：
 * - 入场：弹簧上升 + 透明度
 * - 退场：0.12s 快速淡出缩小（popLayout 立即腾出格子 → 归位立刻开始）
 * - 归位：x/y 弹簧滑动（带轻微回弹）
 * - 遵循「减少动态效果」时退化为纯透明度
 * ============================================================ */

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

const CARD_TRANSITION = {
  default: { type: "spring" as const, bounce: 0.16, duration: 0.5 },
  opacity: { type: "tween" as const, duration: 0.12, ease: "easeOut" as const },
  scale: { type: "tween" as const, duration: 0.12, ease: EASE_OUT_EXPO },
  x: { type: "spring" as const, bounce: 0.18, duration: 0.55 },
  y: { type: "spring" as const, bounce: 0.18, duration: 0.55 },
};

interface AnimatedCardProps {
  className?: string;
  children: ReactNode;
  onOpen?: () => void;
  style?: CSSProperties;
  tilt?: boolean;
  hoverY?: number;
  tapScale?: number;
}

export function AnimatedCard({
  className = "",
  children,
  onOpen,
  style,
  tilt = true,
  hoverY = -4,
  tapScale = 0.98,
}: AnimatedCardProps) {
  const reduce = useReducedMotion();
  const t = useTilt(6);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.();
    }
  };

  return (
    <motion.div
      layout
      className={className}
      role="button"
      tabIndex={0}
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      transition={CARD_TRANSITION}
      whileHover={reduce ? undefined : { y: hoverY }}
      whileTap={{ scale: tapScale }}
      ref={tilt ? t.ref : undefined}
      onMouseMove={tilt ? t.onMouseMove : undefined}
      onMouseLeave={tilt ? t.onMouseLeave : undefined}
      style={tilt ? { ...t.style, ...style } : style}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {children}
    </motion.div>
  );
}
