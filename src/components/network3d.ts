import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ExtraOrb, MechLayout, Node3, SimModel, V3 } from "./NetworkView";

/* ============================================================
 * 招式网络 · three.js 力导向知识图谱引擎
 *
 * 设计目标：方法-题目体系的「可读性」优先，同时保持产品级质感。
 *  - 方法 = 蓝色发光球体（大 = 关联多，永远带标签）
 *  - 题目 = 状态色小球体（绿/橙/红/灰）
 *  - 关联 = 霓虹连线：核心=亮蓝实线 / 辅助=蓝虚线 / 延伸=灰点线
 *  - 方法共题 = 靛紫弧线、题目共法 = 青色弧线
 *  - 三维力导向布局：相连的互相靠近、枢纽居中，结构自然浮现
 *  - 单击高亮邻域（其余淡化）；双击飞入节点：球体变为半透明外壳，
 *    内部展开步骤链（琥珀色）/解法环（简易度着色）+ 邻居环绕
 *  - 阻尼惯性相机 + 弧线 dolly-zoom + 空闲自动环绕 + ACES/Bloom
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

const BASE_DIST = 1400;
const MIN_DIST = 300;
const MAX_DIST = 3200;
const BASE_FOV = 38;
const DIVE_FOV = 47;

const STATUS_COLOR: Record<string, number> = {
  solved: 0x34c759,
  todo: 0xff9f0a,
  stuck: 0xff453a,
};

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface Tween {
  t0: number;
  delay: number;
  dur: number;
  ease: (t: number) => number;
  apply: (k: number) => void;
}

function metal(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(params);
}

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

interface SimNode3D {
  id: string;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fixed: boolean;
  r: number;
}

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

interface NodeVis {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  glow: THREE.Sprite;
  glowMat: THREE.SpriteMaterial;
  ring: THREE.Sprite;
  ringMat: THREE.SpriteMaterial;
}

export function createEngine(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  deps: EngineDeps
): EngineApi {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
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

  /* ---------- 后期 ---------- */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.6, 0.85);
  composer.addPass(bloom);

  /* ---------- 材质 ---------- */
  const statusColor = (s?: string) =>
    s && STATUS_COLOR[s] !== undefined ? STATUS_COLOR[s] : 0x8e8e93;

  const makeNodeMat = (color: number, emissive: number, intensity: number) =>
    metal({
      color,
      emissive,
      emissiveIntensity: intensity,
      metalness: 0.35,
      roughness: 0.3,
      transparent: true,
      opacity: 1,
      envMapIntensity: 0.5,
    });


  const glowTex = makeGlowTexture();
  const ringTex = makeRingTexture();

  /* ---------- 场景结构 ---------- */
  const graphGroup = new THREE.Group();
  scene.add(graphGroup);
  const extraGroup = new THREE.Group();
  scene.add(extraGroup);
  const floorGroup = new THREE.Group();
  scene.add(floorGroup);

  const simNodes = new Map<string, SimNode3D>();
  const nodeVis = new Map<string, NodeVis>();
  const edges: EdgeVis[] = [];
  const extraOrbs: { mesh: THREE.Group; fromKey: string; kind: string; r: number }[] = [];

  let alpha = 0.9;
  let W = 0;
  let H = 0;
  const tweens: Tween[] = [];

  const camState: EngineCamState = {
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
  deps.camStateRef.current = camState;

  /* ---------- 相机 ---------- */
  const applyCamera = () => {
    const cs = camState;
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
  };

  /* ---------- 地面光池 ---------- */
  const buildFloor = () => {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2400, 48),
      metal({ color: 0x060910, roughness: 0.95, metalness: 0.25 })
    );
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
  };
  buildFloor();

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
      color: color,
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

    // 节点
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
        makeNode(n.id, r, 0x4da3ff, 0x0a84ff, 0.5);
      } else {
        const c = statusColor(n.status);
        makeNode(n.id, r, c, c, 0.45);
      }
    }

    // 边
    const bendOf = (a: string, b: string) => {
      const h = a < b ? a + "|" + b : b + "|" + a;
      let hh = 0;
      for (let i = 0; i < h.length; i++) hh = (hh * 31 + h.charCodeAt(i)) | 0;
      const ang = ((hh % 628) / 628) * Math.PI * 2;
      const amt = 70 + (Math.abs(hh) % 60);
      return new THREE.Vector3(Math.cos(ang) * amt, Math.sin(ang) * amt, (Math.abs(hh >> 3) % 40) - 20);
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
        makeEdge(l.s.id, l.t.id, "comethod", undefined, 250, 0x9b8cff, 0.42, false, true, bendOf(l.s.id, l.t.id));
      } else {
        makeEdge(l.s.id, l.t.id, "coproblem", undefined, 200, 0x5ecbe8, 0.36, false, true, bendOf(l.s.id, l.t.id));
      }
    }

    alpha = 0.9;
    applyInside();
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
        // 邻居环绕：从 nodeStore 目标缓动
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
        // 步骤链 / 解法环
        deps.extraRef.current.forEach((e, idx) => {
          const group = new THREE.Group();
          const c = new THREE.Color(e.pal.base);
          const mat = makeNodeMat(
            (e.pal.base.startsWith("#") ? e.pal.base : "#" + e.pal.base) as unknown as number,
            0,
            0
          );
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

    // 透明度目标
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
  };

  /* ---------- 相机动作 ---------- */
  const flyTo = (target: V3, dist: number, dur: number, dive: boolean) => {
    const cs = camState;
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
  };

  const dragStage = (dx: number, dy: number) => {
    const cs = camState;
    cs.targetYaw -= dx * 0.005;
    cs.targetPitch = Math.min(1.25, Math.max(-1.25, cs.targetPitch + dy * 0.004));
    deps.lastInteractRef.current = performance.now();
  };

  const zoomBy = (factor: number) => {
    camState.targetDist = Math.min(MAX_DIST, Math.max(MIN_DIST, camState.targetDist * factor));
    deps.lastInteractRef.current = performance.now();
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
  };

  /* ---------- 力导向 ---------- */
  const tickForces = (dt: number) => {
    const ns = [...simNodes.values()];
    const k = deps.insideRef2.current ? Math.min(alpha, 0.04) : alpha;
    const s = dt / 16.7;
    // 斥力
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
    // 弹簧
    for (const e of edges) {
      const a = simNodes.get(e.aId);
      const b = simNodes.get(e.bId);
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
    // 中心引力
    for (const n of ns) {
      n.vel.x += -n.pos.x * 0.0018 * k * s;
      n.vel.y += -n.pos.y * 0.0022 * k * s;
      n.vel.z += -n.pos.z * 0.0018 * k * s;
    }
    // 积分 + 阻尼
    for (const n of ns) {
      if (n.fixed) {
        n.vel.set(0, 0, 0);
        continue;
      }
      n.vel.multiplyScalar(0.85);
      const sp = n.vel.length();
      if (sp > 26) n.vel.multiplyScalar(26 / sp);
      n.pos.addScaledVector(n.vel, s);
    }
    // 碰撞
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
    alpha *= Math.pow(0.993, dt / 16.7);
    if (alpha < 0.02) alpha = 0.02;
  };

  /* ---------- 主循环 ---------- */
  let raf = 0;
  let lastNow = 0;

  const loop = (now: number) => {
    const dt = Math.min(50, now - (lastNow || now));
    lastNow = now;

    // 补间
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (now - tw.t0 < tw.delay) continue;
      const k = clamp01((now - tw.t0 - tw.delay) / Math.max(1, tw.dur));
      tw.apply(tw.ease(k));
      if (k >= 1) tweens.splice(i, 1);
    }

    // 相机
    const cs = camState;
    cs.yaw += (cs.targetYaw - cs.yaw) * 0.085;
    cs.pitch += (cs.targetPitch - cs.pitch) * 0.085;
    cs.dist += (cs.targetDist - cs.dist) * 0.08;
    const reduce = !!deps.reduceRef.current;
    if (!reduce && !deps.insideRef2.current && now - deps.lastInteractRef.current > 4500) {
      cs.targetYaw += 0.0003 * (dt / 16.7);
    }
    applyCamera();

    // 力导向
    tickForces(dt);

    // 节点显示同步
    const sel = deps.selectedRef.current;
    const hov = deps.hoveredRef.current;
    for (const [id, n3] of simNodes) {
      const v = nodeVis.get(id);
      if (!v) continue;
      v.group.position.copy(n3.pos);
      const hot = sel === id || hov === id;
      v.mat.emissiveIntensity += ((hot ? 1.1 : 0.5) - v.mat.emissiveIntensity) * 0.12;
      v.glowMat.opacity += ((hot ? 1 : 0.85) - v.glowMat.opacity) * 0.12;
      v.ringMat.opacity += ((sel === id ? 0.95 : 0) - v.ringMat.opacity) * 0.14;
    }

    // 边同步
    const hl = deps.highlightRef.current;
    const mt = deps.matchedRef.current;
    const posAttr = (e: EdgeVis) =>
      (e.line.geometry.getAttribute("position") as THREE.BufferAttribute);
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
      // 高亮淡化
      const active = sel != null && (e.aId === sel || e.bId === sel);
      let target = e.base;
      if (hl) target = active ? 1 : 0.05;
      if (mt) target = mt.has(e.aId) && mt.has(e.bId) ? 1 : 0.04;
      e.mat.opacity += (target - e.mat.opacity) * 0.1;
    }

    composer.render();

    // 命中层同步
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

    const pct = Math.round((BASE_DIST / cs.targetDist) * 100);
    if (deps.zoomReadoutRef.current) {
      deps.zoomReadoutRef.current.textContent = pct + "%";
    }
    deps.setZoomedIn(cs.targetDist < 1000);

    raf = requestAnimationFrame(loop);
  };

  /* ---------- 尺寸 ---------- */
  const resize = () => {
    const r = stage.getBoundingClientRect();
    W = Math.max(50, r.width);
    H = Math.max(50, r.height);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  raf = requestAnimationFrame(loop);

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
      cancelAnimationFrame(raf);
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
