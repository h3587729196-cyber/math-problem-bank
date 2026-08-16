import { useRef, type MouseEvent } from "react";
import {
  useMotionValue,
  useReducedMotion,
  useSpring,
  type MotionValue,
} from "motion/react";

/* ============================================================
 * useTilt · 卡片 3D 悬浮倾斜
 *
 * 卡片向光标方向微微 3D 旋转（苹果发布会式质感），弹簧回正。
 * 遵循「减少动态效果」：开启时自动禁用。
 * ============================================================ */

export function useTilt(max = 6) {
  const reduce = useReducedMotion();
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 300, damping: 22, mass: 0.6 });
  const rotateY = useSpring(ry, { stiffness: 300, damping: 22, mass: 0.6 });
  const ref = useRef<HTMLDivElement | null>(null);

  const onMouseMove = (e: MouseEvent) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    rotateY.set(px * max);
    rotateX.set(-py * max);
  };

  const onMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  const style = {
    rotateX: rotateX as MotionValue<number>,
    rotateY: rotateY as MotionValue<number>,
    transformPerspective: 900,
  };

  return { ref, onMouseMove, onMouseLeave, style };
}
