import { useEffect, useRef } from "react";

/* ============================================================
 * 粒子背景 · 弹性粒子场（单色 · 密集 · 强律动 · 回归原位）
 *
 * - 粒子按六角蜂窝网格均匀铺满（无连线），单一颜色、较淡、密集。
 *   每粒子有锚点（home），静止时安静待位，仅极淡呼吸微光。
 * - 鼠标来了，三重律动：
 *   ① 冲刷：高斯力场把附近粒子冲开（尾流拖行 + 前方排开 + 旋涡）；
 *   ② 涟漪：快速移动时在路径上激发扩散的圆形波纹，粒子被一波波
 *      向外推开，像水面泛起涟漪；
 *   ③ 沙流：光标处喷射单色沙粒，随尾流飘出渐隐。
 * - 鼠标走了：有弹性的弹簧把粒子拉回锚点（轻微回弹 → 复原）。
 *
 * 双主题自适应：深色=淡白光点（lighter 泛光），浅色=深灰微尘。
 * 性能：DPR≤1.5、均匀网格可控数量、无连线、document.hidden 暂停、
 *       prefers-reduced-motion 渲染静态帧。
 * ============================================================ */

type Theme = "light" | "dark";

interface P {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  ph: number;
  ts: number;
  life: number;
  maxLife: number;
}

interface Wave {
  x: number;
  y: number;
  r: number;
  speed: number;
  maxR: number;
  strength: number;
}

const TAU = Math.PI * 2;
const rand = (min: number, max: number) => min + Math.random() * (max - min);

const detectTheme = (): Theme => {
  const dt = document.documentElement.dataset.theme;
  if (dt === "dark") return "dark";
  if (dt === "light") return "light";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const reduceMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 单色粒子（深色=淡白，浅色=深灰微尘）+ 光晕色 */
const PALETTES: Record<Theme, { p: string; glow: string }> = {
  dark: { p: "226, 230, 244", glow: "125, 122, 255" },
  light: { p: "104, 110, 128", glow: "98, 94, 230" },
};

/* ---------- 物理参数 ---------- */
const SPRING_K = 26; // 弹性系数（更强，回归更快更弹）
const SPRING_DAMP = 5.5; // 阻尼（更低 → 回弹更活泼，律动感强）
const MOUSE_R = 240; // 力场半径
const SIGMA = 104; // 高斯宽度
const SAND_CAP = 130; // 沙流粒子上限
const WAVE_CAP = 10; // 涟漪上限
/** 恒定 ~4500 粒子（3 倍密度）：间距随视口缩放（小屏自动降一点，大屏不暴涨） */
const GRID_SPACING = (w: number, h: number) =>
  Math.max(12, Math.min(28, Math.round(Math.sqrt((w * h) / 4500))));

export function ParticleBackground() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let theme: Theme = detectTheme();
    let particles: P[] = [];
    const waves: Wave[] = [];
    let raf = 0;
    let last = performance.now();
    let time = 0;
    const reduced = reduceMotion();

    const mouse = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };

    const build = () => {
      const sp = GRID_SPACING(w, h);
      const cols = Math.ceil(w / sp) + 1;
      const rows = Math.ceil(h / sp) + 1;
      particles = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const hx = c * sp + (r % 2) * sp * 0.5;
          const hy = r * sp;
          particles.push({
            hx: hx + rand(-sp * 0.14, sp * 0.14),
            hy: hy + rand(-sp * 0.14, sp * 0.14),
            x: hx + rand(-sp * 0.14, sp * 0.14),
            y: hy + rand(-sp * 0.14, sp * 0.14),
            vx: 0,
            vy: 0,
            r: rand(0.6, 1.3),
            alpha: rand(0.2, 0.4),
            ph: Math.random() * TAU,
            ts: rand(0.4, 1.2),
            life: Infinity,
            maxLife: Infinity,
          });
        }
      }
    };

    const drawFrame = () => {
      const pal = PALETTES[theme];
      ctx.clearRect(0, 0, w, h);

      ctx.globalCompositeOperation = theme === "dark" ? "lighter" : "source-over";
      // 批量绘制：环境粒子是同色圆点，合并成一条 Path2D 一次填充，
      // 支撑 4500+ 粒子依然流畅（集体呼吸代替逐粒闪烁）
      const breathe = 0.85 + 0.15 * Math.sin(time * 0.5);
      const ambientPath = new Path2D();
      for (const p of particles) {
        if (p.life !== Infinity) continue;
        ambientPath.moveTo(p.x + p.r, p.y);
        ambientPath.arc(p.x, p.y, p.r, 0, TAU);
      }
      ctx.fillStyle = `rgba(${pal.p}, ${0.3 * breathe})`;
      ctx.fill(ambientPath);
      // 沙粒：少量，逐粒淡入淡出
      for (const p of particles) {
        if (p.life === Infinity) continue;
        const lifeK = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = `rgba(${pal.p}, ${p.alpha * lifeK})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      // 鼠标光晕（随移动速度脉冲律动）
      if (mouse.active) {
        const pulse = Math.min(1, Math.hypot(mouse.vx, mouse.vy) / 700);
        const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, MOUSE_R);
        const glowA = (theme === "dark" ? 0.13 : 0.08) * (0.7 + 0.6 * pulse);
        g.addColorStop(0, `rgba(${pal.glow}, ${glowA})`);
        g.addColorStop(0.55, `rgba(${pal.glow}, ${glowA * 0.3})`);
        g.addColorStop(1, `rgba(${pal.glow}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, MOUSE_R, 0, TAU);
        ctx.fill();
      }
    };

    const update = (dt: number) => {
      time += dt;
      mouse.vx *= Math.pow(0.001, dt);
      mouse.vy *= Math.pow(0.001, dt);
      const mspd = Math.hypot(mouse.vx, mouse.vy);
      const vxu = mspd > 1 ? mouse.vx / mspd : 0;
      const vyu = mspd > 1 ? mouse.vy / mspd : 0;

      // 涟漪：快速移动时在光标处激发扩散波纹
      if (mouse.active && mspd > 180 && waves.length < WAVE_CAP) {
        waves.push({
          x: mouse.x,
          y: mouse.y,
          r: 10,
          speed: 300 + mspd * 0.25,
          maxR: 230,
          strength: Math.min(1, mspd / 800) * 0.9,
        });
      }
      for (let wi = waves.length - 1; wi >= 0; wi--) {
        const wave = waves[wi];
        wave.r += wave.speed * dt;
        if (wave.r >= wave.maxR) {
          waves.splice(wi, 1);
          continue;
        }
        const decay = 1 - wave.r / wave.maxR;
        // 波纹带内的粒子被向外推开
        for (const p of particles) {
          if (p.life !== Infinity) continue;
          const dx = p.x - wave.x;
          const dy = p.y - wave.y;
          const d = Math.hypot(dx, dy);
          const band = Math.abs(d - wave.r);
          if (band < 18 && d > 1) {
            const k = (1 - band / 18) * wave.strength * decay;
            const kick = 1500 * k;
            p.vx += (dx / d) * kick * dt;
            p.vy += (dy / d) * kick * dt;
          }
        }
      }

      // 沙流喷射
      let sandCount = 0;
      for (const p of particles) if (p.life !== Infinity) sandCount++;
      if (mouse.active && mspd > 26 && sandCount < SAND_CAP) {
        const rate = mspd * 0.05;
        let n = Math.floor(rate * dt);
        if (Math.random() < rate * dt - Math.floor(rate * dt)) n += 1;
        n = Math.min(n, 2, SAND_CAP - sandCount);
        for (let i = 0; i < n; i++) {
          const ang = Math.atan2(mouse.vy, mouse.vx) + rand(-0.7, 0.7);
          const sp = Math.max(40, mspd * rand(0.3, 0.85) + 30);
          const life = rand(1.1, 2.4);
          particles.push({
            hx: mouse.x,
            hy: mouse.y,
            x: mouse.x + rand(-7, 7),
            y: mouse.y + rand(-7, 7),
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            r: rand(0.6, 1.4),
            alpha: rand(0.26, 0.5),
            ph: Math.random() * TAU,
            ts: rand(0.5, 1.6),
            life,
            maxLife: life,
          });
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].life !== Infinity) {
          particles[i].life -= dt;
          if (particles[i].life <= 0) particles.splice(i, 1);
        }
      }

      for (const p of particles) {
        if (p.life === Infinity) {
          // 弹性粒子：锚点 + 呼吸微光
          const shimmerX = Math.sin(time * 0.6 + p.ph) * 0.5;
          const shimmerY = Math.cos(time * 0.45 + p.ph * 1.3) * 0.5;
          const hx = p.hx + shimmerX;
          const hy = p.hy + shimmerY;

          // 弹簧（强弹性 → 活泼回弹）+ 阻尼
          p.vx += (hx - p.x) * SPRING_K * dt;
          p.vy += (hy - p.y) * SPRING_K * dt;
          p.vx -= p.vx * SPRING_DAMP * dt;
          p.vy -= p.vy * SPRING_DAMP * dt;

          // 鼠标冲刷（强）
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy;
          if (mouse.active && d2 < MOUSE_R * MOUSE_R) {
            const d = Math.sqrt(d2);
            const g = Math.exp(-d2 / (2 * SIGMA * SIGMA));
            const dot = d > 1 ? (dx * vxu + dy * vyu) / d : 0;
            const behind = 0.3 + 0.7 * (1 - Math.max(0, dot));
            const wake = Math.min(1250, 320 + mspd * 1.6) * g * behind;
            p.vx += vxu * wake * dt;
            p.vy += vyu * wake * dt;
            const front = 0.35 + 0.65 * Math.max(0, dot);
            const rep = 900 * g * front;
            p.vx += (dx / d) * rep * dt;
            p.vy += (dy / d) * rep * dt;
            const sw = 650 * g;
            p.vx += (-dy / d) * sw * dt;
            p.vy += (dx / d) * sw * dt;
          }
        } else {
          p.vx *= Math.pow(0.02, dt);
          p.vy *= Math.pow(0.02, dt);
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.life === Infinity) {
          if (p.x < -12) p.x = w + 12;
          else if (p.x > w + 12) p.x = -12;
          if (p.y < -12) p.y = h + 12;
          else if (p.y > h + 12) p.y = -12;
        }
      }
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (document.hidden) return;
      update(dt);
      drawFrame();
    };

    let lastX = -9999;
    let lastY = -9999;
    let lastMove = performance.now();
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      const dms = Math.max(8, now - lastMove);
      if (lastX >= 0) {
        mouse.vx = ((e.clientX - lastX) / dms) * 1000;
        mouse.vy = ((e.clientY - lastY) / dms) * 1000;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      lastMove = now;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
      lastX = -9999;
      lastY = -9999;
    };

    const applyTheme = () => {
      const next = detectTheme();
      if (next !== theme) {
        theme = next;
        if (reduced) drawFrame();
      }
    };
    const mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    mql?.addEventListener?.("change", applyTheme);
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      const dpr = Math.min(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (reduced) drawFrame();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);

    if (!reduced) raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      mql?.removeEventListener?.("change", applyTheme);
      mo.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="particle-bg" aria-hidden="true" />;
}
