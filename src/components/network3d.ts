import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ExtraOrb, MechLayout, Node3, SimModel, V3 } from "./NetworkView";

/* ============================================================
 * 招式网络 · three.js 力导向知识图谱引擎（架构 v2）
 *
 * v2 核心架构升级（保留全部公开接口与交互语义）：
 *
 * 1. 空间哈希加速力模拟
 *    O(n²) 全对全斥力/碰撞 → 网格分桶，只计算相邻 27 格，
 *    平均 O(n)；节点少（≤48）时自动回退暴力法（哈希开销反超）。
 *
 * 2. 收敛冻结 + 按需渲染（省电核心）
 *    力模拟收敛（动能 < 阈值）、补间清空、相机静止后：
 *    渲染最后一帧并挂起 requestAnimationFrame——CPU/GPU 占用归零。
 *    任何交互（拖拽/缩放/飞行/高亮/重建）或空闲自动环绕都会唤醒。
 *    页面隐藏（visibilitychange）时强制挂起，恢复时唤醒。
 *
 * 3. 渲染降级
 *    UnrealBloom 分辨率随舞台面积自适应（小屏/低端机减半），
 *    pixelRatio 上限 1.5（移动端），减少填充率压力。
 *
 * 4. 模块化分区
 *    常量/相机/补间/力模拟/渲染/命中层/引擎壳分区清晰，
 *    数据流单向：交互 API → 状态 → 每帧 tick → render。
 *
 * 视觉语义（不变）：方法 = 发光球体（掌握度 <3 显示暖色=薄弱），
 * 题目 = 状态色球体；核心=亮蓝实线 / 辅助=虚线 / 延伸=点线；
 * 方法共题=靛紫弧线、题目共法=青色弧线；双击飞入内部结构。
 * ========================================================== */

export interface EngineCamState {
  yaw: number;
  pitch: number;
  dist: number;
  target: THREE.Vector3;
  targetYaw: number;
  targetPitch: number;
  targetDist: number;
  fov: number;
  targetFov: number;
}

export interface EngineDeps {
  layoutRef: { current: MechLayout };
  nodeStoreRef: { current: Map<string, Node3> };
  insideRef: { current: { coreId: string; right: V3; up: V3; xray: Set<string> } | null };
  extraRef: { current: ExtraOrb[] };
  simRef: { current: SimModel };
  selectedRef: { current: string | null };
  highlightRef: { current: Set<string> | null };
  matchedRef: { current: Set<string> | null };
  hoveredRef: { current: string | null };
  insideRef2: { current: string | null };
  reduceRef: { current: boolean | null };
  hitElRef: { current: Map<string, HTMLDivElement> };
  zoomReadoutRef: { current: HTMLSpanElement | null };
  lastInteractRef: { current: number };
  setZoomedIn: (z: boolean) => void;
  camStateRef: { current: EngineCamState | null };
}

export interface EngineApi {
  rebuild(): void;
  applyInside(): void;
  flyTo(target: V3, dist: number, dur: number, dive: boolean): void;
  dragStage(dx: number, dy: number): void;
  zoomBy(factor: number): void;
  dragNode(id: string, clientX: number, clientY: number): void;
  getPos(id: string): V3 | null;
  getBounds(): { center: V3; radius: number };
  relax(): void;
  dispose(): void;
}

/* ================= 常量 ================= */

const BASE_DIST = 1400;
const MIN_DIST = 300;
const MAX_DIST = 3200;
const BASE_FOV = 38;
const DIVE_FOV = 47;
/** 力模拟收敛阈值：动能低于此值且无动画 → 挂起渲染循环 */
const ENERGY_STILL = 0.03;
const ALPHA_STILL = 0.1;
/** 空闲自动环绕时长（ms）：环绕结束后收敛休眠；交互随时唤醒并重启 */
const ORBIT_DURATION = 30000;
/** 暴力法节点数上限（空间哈希在该规模下开销反超） */
const BRUTE_FORCE_N = 48;
/** 空间哈希格边长 = 2×最大节点半径 + 间隙 */
const HASH_CELL = 2 * 34 + 28;

const STATUS_COLOR: Record<string, number> = {
  solved: 0x34c759,
  todo: 0xff9f0a,
  stuck: 0xff453a,
};
/** 方法掌握度 → 球体颜色：<3 薄弱=暖橙，>=3 健康=品牌蓝，未设=灰蓝 */
const MASTERY_COLOR = {
  weak: 0xff9f0a,
  ok: 0x4da3ff,
  none: 0x4d6f96,
} as const;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/* ================= 补间队列 ================= */

interface Tween {
  t0: number;
  delay: number;
  dur: number;
  ease: (t: number) => number;
  apply: (k: number) => void;
}

class TweenQueue {
  private list: Tween[] = [];
  get size(): number {
    return this.list.length;
  }
  push(t: Tween): void {
    this.list.push(t);
  }
  /** 推进补间；返回是否仍有活跃项 */
  tick(now: number): boolean {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (now - tw.t0 < tw.delay) continue;
      const k = clamp01((now - tw.t0 - tw.delay) / Math.max(1, tw.dur));
      tw.apply(tw.ease(k));
      if (k >= 1) this.list.splice(i, 1);
    }
    return this.list.length > 0;
  }
  clear(): void {
    this.list.length = 0;
  }
}

/* ================= 相机 ================= */

class CameraRig {
  cam: EngineCamState;
  constructor() {
    this.cam = {
      yaw: -0.62,
      pitch: 0.32,
      dist: BASE_DIST * 1.6,
      target: new THREE.Vector3(0, 10, 0),
      targetYaw: -0.62,
      targetPitch: 0.32,
      targetDist: BASE_DIST,
      fov: BASE_FOV,
      targetFov: BASE_FOV,
    };
  }
  /** 弹簧逼近一帧；返回是否仍在运动中 */
  step(camera: THREE.PerspectiveCamera): boolean {
    const cs = this.cam;
    cs.yaw += (cs.targetYaw - cs.yaw) * 0.085;
    cs.pitch += (cs.targetPitch - cs.pitch) * 0.085;
    cs.dist += (cs.targetDist - cs.dist) * 0.08;
    const cy = Math.cos(cs.pitch);
    const sy = Math.sin(cs.pitch);
    const cx = Math.cos(cs.yaw);
    const sx = Math.sin(cs.yaw);
    camera.position.set(
      cs.target.x + cs.dist * cy * sx,
      cs.target.y + cs.dist * sy,
      cs.target.z + cs.dist * cy * cx
    );
    camera.lookAt(cs.target);
    if (Math.abs(cs.targetFov - cs.fov) > 0.02) {
      cs.fov += (cs.targetFov - cs.fov) * 0.1;
      camera.fov = cs.fov;
      camera.updateProjectionMatrix();
    }
    const moving =
      Math.abs(cs.targetYaw - cs.yaw) +
        Math.abs(cs.targetPitch - cs.pitch) +
        Math.abs(cs.targetDist - cs.dist) >
      0.004;
    return moving;
  }
  flyTo(target: V3, dist: number, dur: number, dive: boolean, tweens: TweenQueue) {
    const cs = this.cam;
    const fromT = cs.target.clone();
    const toT = new THREE.Vector3(target.x, target.y, target.z);
    const ctrl = fromT.clone().add(toT).multiplyScalar(0.5);
    ctrl.y += fromT.distanceTo(toT) * (dive ? 0.5 : 0.24);
    const fromD = cs.targetDist;
    const fromFov = cs.targetFov;
    const toFov = dive ? DIVE_FOV : BASE_FOV;
    tweens.push({
      t0: performance.now(),
      delay: 0,
      dur,
      ease: easeInOutCubic,
      apply: (k) => {
        const a = 1 - k;
        cs.target.set(
          a * a * fromT.x + 2 * a * k * ctrl.x + k * k * toT.x,
          a * a * fromT.y + 2 * a * k * ctrl.y + k * k * toT.y,
          a * a * fromT.z + 2 * a * k * ctrl.z + k * k * toT.z
        );
        cs.targetDist = fromD + (dist - fromD) * k;
        cs.targetFov = fromFov + (toFov - fromFov) * k;
      },
    });
  }
}

/* ================= 力模拟（空间哈希加速） ================= */

interface SimNode3D {
  id: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fixed: boolean;
  r: number;
}

const HASH_X = 73856093;
const HASH_Y = 19349663;
const HASH_Z = 83492791;

function hashCell(cx: number, cy: number, cz: number): number {
  return (cx * HASH_X) ^ (cy * HASH_Y) ^ (cz * HASH_Z);
}

/**
 * 力模拟核心：斥力 + 弹簧 + 中心引力 + 积分阻尼 + 碰撞。
 * 返回系统动能（速度平方和），供上层做收敛判定。
 */
function tickForces(
  nodes: Map<string, SimNode3D>,
  edges: { aId: string; bId: string; rest: number }[],
  alpha: number,
  inside: boolean,
  dt: number
): number {
  const ns = [...nodes.values()];
  if (ns.length === 0) return 0;
  const k = inside ? Math.min(alpha, 0.04) : alpha;
  const s = dt / 16.7;
  const useHash = ns.length > BRUTE_FORCE_N;

  /* ---- 斥力（空间哈希 / 暴力） ---- */
  if (useHash) {
    const cells = new Map<number, number[]>();
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      const cx = Math.floor(n.pos.x / HASH_CELL);
      const cy = Math.floor(n.pos.y / HASH_CELL);
      const cz = Math.floor(n.pos.z / HASH_CELL);
      const key = hashCell(cx, cy, cz);
      let arr = cells.get(key);
      if (!arr) {
        arr = [];
        cells.set(key, arr);
      }
      arr.push(i);
    }
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      const cx = Math.floor(a.pos.x / HASH_CELL);
      const cy = Math.floor(a.pos.y / HASH_CELL);
      const cz = Math.floor(a.pos.z / HASH_CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (let gz = cz - 1; gz <= cz + 1; gz++) {
            const arr = cells.get(hashCell(gx, gy, gz));
            if (!arr) continue;
            for (const j of arr) {
              if (j <= i) continue;
              const b = ns[j];
              const dx = b.pos.x - a.pos.x;
              const dy = b.pos.y - a.pos.y;
              const dz = b.pos.z - a.pos.z;
              let d2 = dx * dx + dy * dy + dz * dz;
              if (d2 < 1) {
                const jx = ((i * 37 + j * 91) % 100) / 100 - 0.5;
                const jz = ((i * 13 + j * 57) % 100) / 100 - 0.5;
                b.pos.x += jx;
                b.pos.z += jz;
                d2 = 1;
              }
              const f = (-2600 * k) / (d2 + 120);
              const d = Math.sqrt(d2);
              const ux = dx / d;
              const uy = dy / d;
              const uz = dz / d;
              const fa = f / (1 + a.r * 0.03);
              const fb = f / (1 + b.r * 0.03);
              a.vel.x += ux * fa * s;
              a.vel.y += uy * fa * s;
              a.vel.z += uz * fa * s;
              b.vel.x -= ux * fb * s;
              b.vel.y -= uy * fb * s;
              b.vel.z -= uz * fb * s;
            }
          }
        }
      }
    }
  } else {
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dz = b.pos.z - a.pos.z;
        let d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1) {
          const jx = ((i * 37 + j * 91) % 100) / 100 - 0.5;
          const jz = ((i * 13 + j * 57) % 100) / 100 - 0.5;
          b.pos.x += jx;
          b.pos.z += jz;
          d2 = 1;
        }
        const f = (-2600 * k) / (d2 + 120);
        const d = Math.sqrt(d2);
        const ux = dx / d;
        const uy = dy / d;
        const uz = dz / d;
        const fa = f / (1 + a.r * 0.03);
        const fb = f / (1 + b.r * 0.03);
        a.vel.x += ux * fa * s;
        a.vel.y += uy * fa * s;
        a.vel.z += uz * fa * s;
        b.vel.x -= ux * fb * s;
        b.vel.y -= uy * fb * s;
        b.vel.z -= uz * fb * s;
      }
    }
  }

  /* ---- 弹簧 ---- */
  for (const e of edges) {
    const a = nodes.get(e.aId);
    const b = nodes.get(e.bId);
    if (!a || !b) continue;
    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const dz = b.pos.z - a.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const f = 0.0075 * k * (d - e.rest);
    const ux = dx / d;
    const uy = dy / d;
    const uz = dz / d;
    a.vel.x += ux * f * s;
    a.vel.y += uy * f * s;
    a.vel.z += uz * f * s;
    b.vel.x -= ux * f * s;
    b.vel.y -= uy * f * s;
    b.vel.z -= uz * f * s;
  }

  /* ---- 中心引力 ---- */
  for (const n of ns) {
    n.vel.x += -n.pos.x * 0.0018 * k * s;
    n.vel.y += -n.pos.y * 0.0022 * k * s;
    n.vel.z += -n.pos.z * 0.0018 * k * s;
  }

  /* ---- 积分 + 阻尼 ---- */
  let energy = 0;
  for (const n of ns) {
    if (n.fixed) {
      n.vel.set(0, 0, 0);
      continue;
    }
    n.vel.multiplyScalar(0.85);
    const sp = n.vel.length();
    if (sp > 26) n.vel.multiplyScalar(26 / sp);
    n.pos.addScaledVector(n.vel, s);
    energy += n.vel.lengthSq();
  }

  /* ---- 碰撞（空间哈希 / 暴力） ---- */
  if (useHash) {
    const cells = new Map<number, number[]>();
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      const cx = Math.floor(n.pos.x / HASH_CELL);
      const cy = Math.floor(n.pos.y / HASH_CELL);
      const cz = Math.floor(n.pos.z / HASH_CELL);
      const key = hashCell(cx, cy, cz);
      let arr = cells.get(key);
      if (!arr) {
        arr = [];
        cells.set(key, arr);
      }
      arr.push(i);
    }
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      const cx = Math.floor(a.pos.x / HASH_CELL);
      const cy = Math.floor(a.pos.y / HASH_CELL);
      const cz = Math.floor(a.pos.z / HASH_CELL);
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (let gz = cz - 1; gz <= cz + 1; gz++) {
            const arr = cells.get(hashCell(gx, gy, gz));
            if (!arr) continue;
            for (const j of arr) {
              if (j <= i) continue;
              const b = ns[j];
              const dx = b.pos.x - a.pos.x;
              const dy = b.pos.y - a.pos.y;
              const dz = b.pos.z - a.pos.z;
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              const min = a.r + b.r + 8;
              if (d < min && d > 0.001) {
                const push = ((min - d) / d) * 0.5;
                if (!a.fixed) a.pos.addScaledVector(new THREE.Vector3(dx, dy, dz), -push);
                if (!b.fixed) b.pos.addScaledVector(new THREE.Vector3(dx, dy, dz), push);
              }
            }
          }
        }
      }
    }
  } else {
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dz = b.pos.z - a.pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const min = a.r + b.r + 8;
        if (d < min && d > 0.001) {
          const push = ((min - d) / d) * 0.5;
          if (!a.fixed) a.pos.addScaledVector(new THREE.Vector3(dx, dy, dz), -push);
          if (!b.fixed) b.pos.addScaledVector(new THREE.Vector3(dx, dy, dz), push);
        }
      }
    }
  }

  return energy;
}

/* ================= 渲染资源 ================= */

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of mats) {
        if (mm && typeof (mm as THREE.Material).dispose === "function") {
          (mm as THREE.Material).dispose();
        }
      }
    }
  });
}

function clearGroup(g: THREE.Group) {
  const children = [...g.children];
  for (const c of children) {
    g.remove(c);
    disposeObject(c);
  }
}

function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g2 = c.getContext("2d")!;
  const rg = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, "rgba(255,255,255,0.9)");
  rg.addColorStop(0.35, "rgba(255,255,255,0.32)");
  rg.addColorStop(1, "rgba(255,255,255,0)");
  g2.fillStyle = rg;
  g2.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeRingTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g2 = c.getContext("2d")!;
  g2.strokeStyle = "rgba(255,255,255,0.95)";
  g2.lineWidth = 7;
  g2.beginPath();
  g2.arc(64, 64, 52, 0, Math.PI * 2);
  g2.stroke();
  return new THREE.CanvasTexture(c);
}

function makeNodeMat(color: number, emissive: number, intensity: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    metalness: 0.35,
    roughness: 0.3,
    transparent: true,
    opacity: 1,
    envMapIntensity: 0.5,
  });
}

/* ================= 边视觉 ================= */

interface EdgeVis {
  line: THREE.Line;
  aId: string;
  bId: string;
  kind: "role" | "comethod" | "coproblem";
  role?: string;
  curved: boolean;
  bend: THREE.Vector3;
  rest: number;
  mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial;
  base: number;
}

/* ================= 节点视觉 ================= */

interface NodeVis {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  glow: THREE.Sprite;
  glowMat: THREE.SpriteMaterial;
  ring: THREE.Sprite;
  ringMat: THREE.SpriteMaterial;
}

/* ================= 引擎壳 ================= */

export function createEngine(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  deps: EngineDeps
): EngineApi {
  /* ---------- 渲染器 ---------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);
  scene.fog = new THREE.FogExp2(0x04060c, 0.00038);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 1, 20000);

  /* ---------- 灯光与环境 ---------- */
  scene.add(new THREE.HemisphereLight(0xbdd3ff, 0x06080d, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(7, 11, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fb2ff, 1.3);
  rim.position.set(-7, 4, -7);
  scene.add(rim);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  /* ---------- 后期（分辨率自适应） ---------- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(dpr);
  composer.addPass(new RenderPass(scene, camera));
  const stageArea = stage.clientWidth * stage.clientHeight;
  const bloomRes = stageArea < 700 * 600 ? 256 : 512;
  const bloom = new UnrealBloomPass(new THREE.Vector2(bloomRes, bloomRes), 0.4, 0.6, 0.85);
  composer.addPass(bloom);

  const glowTex = makeGlowTexture();
  const ringTex = makeRingTexture();

  /* ---------- 场景结构 ---------- */
  const graphGroup = new THREE.Group();
  scene.add(graphGroup);
  const extraGroup = new THREE.Group();
  scene.add(extraGroup);
  const floorGroup = new THREE.Group();
  scene.add(floorGroup);

  /* ---------- 状态 ---------- */
  const simNodes = new Map<string, SimNode3D>();
  const nodeVis = new Map<string, NodeVis>();
  const edges: EdgeVis[] = [];
  const extraOrbs: { mesh: THREE.Group; fromKey: string; kind: string; r: number }[] = [];
  const tweens = new TweenQueue();
  const rig = new CameraRig();
  deps.camStateRef.current = rig.cam;

  let alpha = 0.9;
  let W = 0;
  let H = 0;

  const statusColor = (s?: string) =>
    s && STATUS_COLOR[s] !== undefined ? STATUS_COLOR[s] : 0x8e8e93;

  /* ---------- 地面光池 ---------- */
  {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2400, 48),
      makeNodeMat(0x060910, 0, 0)
    );
    (floor.material as THREE.MeshStandardMaterial).roughness = 0.95;
    (floor.material as THREE.MeshStandardMaterial).metalness = 0.25;
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -260;
    floorGroup.add(floor);
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const g2 = c.getContext("2d")!;
    const rg = g2.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, "rgba(56,108,196,0.2)");
    rg.addColorStop(0.6, "rgba(30,64,128,0.07)");
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g2.fillStyle = rg;
    g2.fillRect(0, 0, 256, 256);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -258;
    glow.renderOrder = -1;
    floorGroup.add(glow);
  }

  /* ---------- 边 ---------- */
  const makeEdge = (
    aId: string,
    bId: string,
    kind: EdgeVis["kind"],
    role: string | undefined,
    rest: number,
    color: number,
    base: number,
    dashed: boolean,
    curved: boolean,
    bend: THREE.Vector3
  ) => {
    const n = curved ? 24 : 2;
    const mat = dashed
      ? new THREE.LineDashedMaterial({
          color,
          transparent: true,
          opacity: base,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          dashSize: 5,
          gapSize: 4,
        })
      : new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: base,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    graphGroup.add(line);
    edges.push({ line, aId, bId, kind, role, curved, bend, rest, mat, base });
  };

  /* ---------- 节点 ---------- */
  const makeNode = (id: string, r: number, color: number, emissive: number, intensity: number) => {
    const group = new THREE.Group();
    const mat = makeNodeMat(color, emissive, intensity);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 22), mat);
    group.add(sphere);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(r * 6, r * 6, 1);
    group.add(glow);
    const ringMat = new THREE.SpriteMaterial({
      map: ringTex,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const ring = new THREE.Sprite(ringMat);
    ring.scale.set(r * 4.4, r * 4.4, 1);
    group.add(ring);
    group.userData.nodeId = id;
    graphGroup.add(group);
    nodeVis.set(id, { group, mat, glow, glowMat, ring, ringMat });
  };

  /* ---------- 重建 ---------- */
  const rebuild = () => {
    clearGroup(graphGroup);
    clearGroup(extraGroup);
    simNodes.clear();
    nodeVis.clear();
    edges.length = 0;
    extraOrbs.length = 0;

    const sim = deps.simRef.current;
    const layout = deps.layoutRef.current;
    const store = deps.nodeStoreRef.current;

    for (const n of sim.nodes) {
      const r =
        n.type === "method"
          ? Math.min(26, 14 + Math.sqrt(n.deg) * 3.4)
          : Math.min(12, 7.5 + Math.sqrt(n.deg) * 1.5);
      const prev = simNodes.get(n.id);
      const st = store.get(n.id);
      const pos =
        prev?.pos ??
        (st ? new THREE.Vector3(st.cur.x, st.cur.y, st.cur.z) : new THREE.Vector3());
      if (!prev && !st) {
        const g = layout.goals.get(n.id);
        if (g) pos.set(g.x, g.y, g.z);
      }
      simNodes.set(n.id, {
        id: n.id,
        pos,
        vel: new THREE.Vector3(),
        fixed: !!prev?.fixed,
        r,
      });
      if (n.type === "method") {
        // 掌握度感知配色：<3 薄弱（暖橙）/ >=3 健康（蓝）/ 未设（灰蓝）
        const lv = n.mastery;
        const weak = lv != null && lv < 3;
        const color = weak ? MASTERY_COLOR.weak : lv != null ? MASTERY_COLOR.ok : MASTERY_COLOR.none;
        const emissive = weak ? 0xff9f0a : lv != null ? 0x0a84ff : 0x2c5a8c;
        makeNode(n.id, r, color, emissive, weak ? 0.55 : 0.5);
      } else {
        const c = statusColor(n.status);
        makeNode(n.id, r, c, c, 0.45);
      }
    }

    const bendOf = (a: string, b: string) => {
      const h = a < b ? a + "|" + b : b + "|" + a;
      let hh = 0;
      for (let i = 0; i < h.length; i++) hh = (hh * 31 + h.charCodeAt(i)) | 0;
      const ang = ((hh % 628) / 628) * Math.PI * 2;
      const amt = 70 + (Math.abs(hh) % 60);
      return new THREE.Vector3(
        Math.cos(ang) * amt,
        Math.sin(ang) * amt,
        (Math.abs(hh >> 3) % 40) - 20
      );
    };
    for (const l of sim.links) {
      const a = simNodes.get(l.s.id);
      const b = simNodes.get(l.t.id);
      if (!a || !b) continue;
      if (l.kind === "role") {
        const color = l.role === "core" ? 0x69b4ff : l.role === "auxiliary" ? 0x5a9de0 : 0x8d9db0;
        const dashed = l.role !== "core";
        const base = l.role === "core" ? 0.75 : l.role === "auxiliary" ? 0.5 : 0.34;
        makeEdge(l.s.id, l.t.id, "role", l.role, 150, color, base, dashed, false, new THREE.Vector3());
      } else if (l.kind === "comethod") {
        makeEdge(
          l.s.id,
          l.t.id,
          "comethod",
          undefined,
          250,
          0x9b8cff,
          0.42,
          false,
          true,
          bendOf(l.s.id, l.t.id)
        );
      } else {
        makeEdge(
          l.s.id,
          l.t.id,
          "coproblem",
          undefined,
          200,
          0x5ecbe8,
          0.36,
          false,
          true,
          bendOf(l.s.id, l.t.id)
        );
      }
    }

    alpha = 0.9;
    applyInside();
    wake();
  };

  /* ---------- 内部结构 ---------- */
  const applyInside = () => {
    clearGroup(extraGroup);
    extraOrbs.length = 0;
    const inside = deps.insideRef2.current;
    const now = performance.now();

    if (inside) {
      const info = deps.insideRef.current;
      const core = simNodes.get(inside);
      if (core && info) {
        core.fixed = true;
        const nb = [...(deps.simRef.current.neighbors.get(inside) ?? new Set<string>())];
        nb.forEach((id, i) => {
          const n3 = simNodes.get(id);
          const goal = deps.nodeStoreRef.current.get(id)?.goal;
          if (!n3 || !goal) return;
          const from = n3.pos.clone();
          const to = new THREE.Vector3(goal.x, goal.y, goal.z);
          n3.fixed = true;
          tweens.push({
            t0: now,
            delay: 160 + i * 70,
            dur: 900,
            ease: easeOutCubic,
            apply: (k) => n3.pos.lerpVectors(from, to, k),
          });
        });
        deps.extraRef.current.forEach((e, idx) => {
          const group = new THREE.Group();
          const c = new THREE.Color(e.pal.base);
          const mat = makeNodeMat(0, 0, 0);
          mat.color.set(c);
          mat.emissive.set(c);
          mat.emissiveIntensity = e.kind === "step" ? 0.8 : 0.55;
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(e.r, 26, 18), mat);
          group.add(mesh);
          const glowMat = new THREE.SpriteMaterial({
            map: glowTex,
            color: c,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          const glow = new THREE.Sprite(glowMat);
          glow.scale.set(e.r * 6, e.r * 6, 1);
          group.add(glow);
          const goal = new THREE.Vector3(e.goal.x, e.goal.y, e.goal.z);
          const fromPos = core.pos.clone();
          group.position.copy(fromPos);
          extraGroup.add(group);
          extraOrbs.push({ mesh: group, fromKey: e.from, kind: e.kind, r: e.r });
          tweens.push({
            t0: now,
            delay: 380 + idx * 90,
            dur: 1000,
            ease: easeOutBack,
            apply: (k) => group.position.lerpVectors(fromPos, goal, k),
          });
        });
      }
    } else {
      for (const n of simNodes.values()) n.fixed = false;
      alpha = 0.75;
    }

    const xray = deps.insideRef.current?.xray ?? null;
    for (const [id, v] of nodeVis) {
      if (inside) {
        const isCore = id === inside;
        const isNb = (deps.simRef.current.neighbors.get(inside) ?? new Set()).has(id);
        v.mat.opacity = isCore ? 0.34 : isNb ? 0.95 : 0.12;
      } else {
        v.mat.opacity = 1;
      }
      void xray;
    }
    wake();
  };

  /* ---------- 相机动作 ---------- */
  const flyTo = (target: V3, dist: number, dur: number, dive: boolean) => {
    rig.flyTo(target, dist, dur, dive, tweens);
    wake();
  };

  const dragStage = (dx: number, dy: number) => {
    const cs = rig.cam;
    cs.targetYaw -= dx * 0.005;
    cs.targetPitch = Math.min(1.25, Math.max(-1.25, cs.targetPitch + dy * 0.004));
    deps.lastInteractRef.current = performance.now();
    wake();
  };

  const zoomBy = (factor: number) => {
    rig.cam.targetDist = Math.min(MAX_DIST, Math.max(MIN_DIST, rig.cam.targetDist * factor));
    deps.lastInteractRef.current = performance.now();
    wake();
  };

  const dragNode = (id: string, clientX: number, clientY: number) => {
    const n3 = simNodes.get(id);
    if (!n3) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(n3.pos.y || 0));
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, point)) {
      n3.pos.set(point.x, n3.pos.y, point.z);
      n3.vel.set(0, 0, 0);
      const st = deps.nodeStoreRef.current.get(id);
      if (st) {
        st.cur.x = point.x;
        st.cur.z = point.z;
      }
      deps.lastInteractRef.current = performance.now();
      wake();
    }
  };

  const getPos = (id: string): V3 | null => {
    const n3 = simNodes.get(id);
    if (!n3) return null;
    return { x: n3.pos.x, y: n3.pos.y, z: n3.pos.z };
  };

  const getBounds = () => {
    const pts = [...simNodes.values()].map((n) => n.pos);
    if (pts.length === 0) return { center: { x: 0, y: 10, z: 0 } as V3, radius: 300 };
    const c = new THREE.Vector3();
    for (const p of pts) c.add(p);
    c.multiplyScalar(1 / pts.length);
    let rMax = 120;
    for (const p of pts) rMax = Math.max(rMax, p.distanceTo(c));
    return { center: { x: c.x, y: c.y, z: c.z }, radius: rMax + 80 };
  };

  const relax = () => {
    for (const n of simNodes.values()) n.fixed = false;
    alpha = 0.9;
    wake();
  };

  /* ---------- 主循环（收敛冻结 + 按需渲染） ---------- */
  let raf = 0;
  let running = false;
  let lastNow = 0;

  /* 休眠监听：React 状态（选中/悬停/高亮/内部）经 ref 传入引擎，
     引擎休眠后靠轻量轮询比对快照，发现变化立即唤醒 */
  let sleepTimer = 0;
  let snap = { sel: "", hov: "", hlSize: 0, mtSize: 0, inside: "" };
  const takeSnap = () => ({
    sel: deps.selectedRef.current ?? "",
    hov: deps.hoveredRef.current ?? "",
    hlSize: deps.highlightRef.current?.size ?? 0,
    mtSize: deps.matchedRef.current?.size ?? 0,
    inside: deps.insideRef2.current ?? "",
  });
  const snapChanged = () => {
    const s = takeSnap();
    return (
      s.sel !== snap.sel ||
      s.hov !== snap.hov ||
      s.hlSize !== snap.hlSize ||
      s.mtSize !== snap.mtSize ||
      s.inside !== snap.inside
    );
  };

  const syncHitLayer = () => {
    const v3 = new THREE.Vector3();
    for (const [id, n3] of simNodes) {
      const el = deps.hitElRef.current.get(id);
      if (!el) continue;
      v3.copy(n3.pos);
      v3.project(camera);
      if (v3.z > 1 || v3.z < -1) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "";
      const sx = (v3.x * 0.5 + 0.5) * W;
      const sy = (-v3.y * 0.5 + 0.5) * H;
      const distCam = camera.position.distanceTo(n3.pos);
      const f = H / 2 / Math.tan((camera.fov * Math.PI) / 360);
      const size = Math.max(38, n3.r * 2 * (f / distCam) + 18);
      el.style.transform =
        "translate3d(" + (sx - size / 2) + "px," + (sy - size / 2) + "px,0)";
      el.style.width = size + "px";
      el.style.height = size + "px";
      el.style.zIndex = String(Math.max(1, Math.min(5, Math.round(3000 - distCam))));
    }
  };

  /** 渲染一帧；返回材质缓动是否仍在进行（用于休眠判定，避免高亮动画被截断） */
  const renderFrame = (): boolean => {
    let matAnimating = false;
    const sel = deps.selectedRef.current;
    const hov = deps.hoveredRef.current;
    for (const [id, n3] of simNodes) {
      const v = nodeVis.get(id);
      if (!v) continue;
      v.group.position.copy(n3.pos);
      const hot = sel === id || hov === id;
      const de = (hot ? 1.1 : 0.5) - v.mat.emissiveIntensity;
      if (Math.abs(de) > 0.02) matAnimating = true;
      v.mat.emissiveIntensity += de * 0.12;
      const dg = (hot ? 1 : 0.85) - v.glowMat.opacity;
      if (Math.abs(dg) > 0.02) matAnimating = true;
      v.glowMat.opacity += dg * 0.12;
      const dr = (sel === id ? 0.95 : 0) - v.ringMat.opacity;
      if (Math.abs(dr) > 0.02) matAnimating = true;
      v.ringMat.opacity += dr * 0.14;
    }

    const hl = deps.highlightRef.current;
    const mt = deps.matchedRef.current;
    const posAttr = (e: EdgeVis) =>
      e.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (const e of edges) {
      const a = simNodes.get(e.aId);
      const b = simNodes.get(e.bId);
      if (!a || !b) continue;
      const attr = posAttr(e);
      const arr = attr.array as Float32Array;
      if (e.curved) {
        const bend = e.bend;
        const midX = (a.pos.x + b.pos.x) / 2 + bend.x;
        const midY = (a.pos.y + b.pos.y) / 2 + bend.y;
        const midZ = (a.pos.z + b.pos.z) / 2 + bend.z;
        const n = arr.length / 3;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const q = 1 - t;
          arr[i * 3] = q * q * a.pos.x + 2 * q * t * midX + t * t * b.pos.x;
          arr[i * 3 + 1] = q * q * a.pos.y + 2 * q * t * midY + t * t * b.pos.y;
          arr[i * 3 + 2] = q * q * a.pos.z + 2 * q * t * midZ + t * t * b.pos.z;
        }
      } else {
        arr[0] = a.pos.x;
        arr[1] = a.pos.y;
        arr[2] = a.pos.z;
        arr[3] = b.pos.x;
        arr[4] = b.pos.y;
        arr[5] = b.pos.z;
      }
      attr.needsUpdate = true;
      if ((e.mat as THREE.LineDashedMaterial).isLineDashedMaterial) {
        e.line.computeLineDistances();
      }
      const active = sel != null && (e.aId === sel || e.bId === sel);
      let target = e.base;
      if (hl) target = active ? 1 : 0.05;
      if (mt) target = mt.has(e.aId) && mt.has(e.bId) ? 1 : 0.04;
      const dop = target - e.mat.opacity;
      if (Math.abs(dop) > 0.02) matAnimating = true;
      e.mat.opacity += dop * 0.1;
    }

    composer.render();
    return matAnimating;
  };

  const loop = (now: number) => {
    const dt = Math.min(50, now - (lastNow || now));
    lastNow = now;

    // 补间
    const hasTween = tweens.tick(now);

    // 相机
    const camMoving = rig.step(camera);
    const reduce = !!deps.reduceRef.current;
    const idleMs = now - deps.lastInteractRef.current;
    const autoOrbit =
      !reduce && !deps.insideRef2.current && idleMs > 4500 && idleMs < 4500 + ORBIT_DURATION;
    if (autoOrbit) {
      rig.cam.targetYaw += 0.0003 * (dt / 16.7);
    }

    // 力导向（返回动能），alpha 冷却由引擎壳持有
    const energy = tickForces(simNodes, edges, alpha, !!deps.insideRef2.current, dt);
    alpha *= Math.pow(0.993, dt / 16.7);
    if (alpha < 0.02) alpha = 0.02;

    // 渲染一帧（返回材质动画是否进行中）
    const matAnimating = renderFrame();
    syncHitLayer();

    const pct = Math.round((BASE_DIST / rig.cam.targetDist) * 100);
    if (deps.zoomReadoutRef.current) {
      deps.zoomReadoutRef.current.textContent = pct + "%";
    }
    deps.setZoomedIn(rig.cam.targetDist < 1000);

    // 收敛冻结：无补间、材质缓动完成、力已收敛、相机静止
    // （dist 差值 < 3px 视为静止，容忍启动推近动画尾段）、且无自动环绕 → 挂起循环
    const ddist = Math.abs(rig.cam.targetDist - rig.cam.dist);
    const still =
      !hasTween &&
      !matAnimating &&
      energy < ENERGY_STILL &&
      alpha <= ALPHA_STILL &&
      (!camMoving || ddist < 3);
    if (still && !autoOrbit) {
      running = false;
      snap = takeSnap();
      sleepTimer = window.setInterval(() => {
        if (snapChanged()) wake();
      }, 400);
      return; // 不请求下一帧，停在当前画面
    }
    raf = requestAnimationFrame(loop);
  };

  const wake = () => {
    if (running) return;
    running = true;
    if (sleepTimer) {
      window.clearInterval(sleepTimer);
      sleepTimer = 0;
    }
    lastNow = 0;
    raf = requestAnimationFrame(loop);
  };

  const onVisibility = () => {
    if (document.hidden) {
      if (running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    } else {
      wake();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  /* ---------- 尺寸 ---------- */
  const resize = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(50, r.width);
    H = Math.max(50, r.height);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    wake();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  wake();

  return {
    rebuild,
    applyInside,
    flyTo,
    dragStage,
    zoomBy,
    dragNode,
    getPos,
    getBounds,
    relax,
    dispose: () => {
      if (running) {
        running = false;
        cancelAnimationFrame(raf);
      }
      if (sleepTimer) {
        window.clearInterval(sleepTimer);
        sleepTimer = 0;
      }
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      clearGroup(graphGroup);
      clearGroup(extraGroup);
      clearGroup(floorGroup);
      pmrem.dispose();
      envScene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m?.dispose?.();
        }
      });
      glowTex.dispose();
      ringTex.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
