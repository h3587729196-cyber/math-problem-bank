import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useReducedMotion } from "motion/react";
import type { Method, MethodRole, Problem, ProblemStatus } from "../types";
import { ROLE_LABEL, SIMPLICITY_LABEL, STATUS_LABEL } from "../types";
import { Empty } from "./ui/Empty";
import { Check, Network, Search, Sparkle, X } from "./ui/icons";
import { createEngine, type EngineApi, type EngineCamState } from "./network3d";

interface NetworkViewProps {
  problems: Problem[];
  methods: Method[];
  onOpenProblem: (id: string) => void;
  onOpenMethod: (id: string) => void;
}

/* ============================================================
 * 招式网络 · 方法与题库关联动态网络（三维深空版）
 *
 * 黑底深空舞台：方法 = 蓝色星球、题目 = 状态色星球，
 * 显式关联按角色（核心实线 / 辅助虚线 / 延伸点线）发光连线，
 * 自动推导「方法共题边」（紫色弧线，粗细 = 共题数）与可选的
 * 「题目共法边」（青色弧线）；能量脉冲沿连线流动。
 *
 * 双击节点 → 相机丝滑飞入，节点展开「内部结构」：
 *   · 方法：核心 + 操作步骤链 + 关联题目环绕环
 *   · 题目：核心 + 解法星球（按简易度着色）+ 关联方法外环
 * 右侧毛玻璃「解剖面板」展示信号/步骤/易错点/图片/解法清单。
 * Esc 飞回全景。
 *
 * 引擎：three.js（WebGLRenderer + EffectComposer + UnrealBloom），
 * 相机弹簧飞行 + 三层视差星野 + 星云 + 深度雾；按需懒加载，不影响首屏。
 * ========================================================== */

/* ---------- 数学与常量 ---------- */

export type V3 = { x: number; y: number; z: number };

const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
const add3 = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul3 = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const cross3 = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const len3 = (a: V3) => Math.hypot(a.x, a.y, a.z);
const norm3 = (a: V3): V3 => {
  const l = len3(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const TAU = Math.PI * 2;
const DEFAULT_DIST = 1300;
const MIN_DIST = 340;
const MAX_DIST = 3000;
const FOV = 38;

interface Palette {
  base: string;
  light: string;
  edge: string;
  glow: string;
}

const PAL: Record<string, Palette> = {
  method: { base: "#0a84ff", light: "#9fd4ff", edge: "#004a94", glow: "rgba(10,132,255,0.5)" },
  solved: { base: "#34c759", light: "#b9f2c8", edge: "#1d7a37", glow: "rgba(52,199,89,0.5)" },
  todo: { base: "#ff9f0a", light: "#ffd893", edge: "#a35e00", glow: "rgba(255,159,10,0.5)" },
  stuck: { base: "#ff453a", light: "#ffb0ab", edge: "#a01c12", glow: "rgba(255,69,58,0.55)" },
  gray: { base: "#8e8e93", light: "#d0d0d4", edge: "#56565b", glow: "rgba(142,142,147,0.4)" },
  step: { base: "#d9a94e", light: "#f3dca4", edge: "#8a6424", glow: "rgba(217,169,78,0.5)" },
};

/* ---------- 图模型 ---------- */

type NType = "method" | "problem";

interface SimNode {
  id: string;
  type: NType;
  r: number;
  deg: number;
  label: string;
  tags: string[];
  community: number;
  status?: Problem["status"];
  difficulty?: Problem["difficulty"];
  mastery?: number;
}

interface SimLink {
  key: string;
  kind: "role" | "comethod" | "coproblem";
  role?: MethodRole;
  s: SimNode;
  t: SimNode;
  w: number;
  bend: V3;
}

export interface SimModel {
  nodes: SimNode[];
  links: SimLink[];
  byId: Map<string, SimNode>;
  neighbors: Map<string, Set<string>>;
}

const STATUSES: ProblemStatus[] = ["todo", "solved", "stuck"];
const ROLES: MethodRole[] = ["core", "auxiliary", "extension"];
const DIFFS = [1, 2, 3, 4, 5];

interface FilterState {
  statuses: Set<ProblemStatus>;
  difficulties: Set<number>;
  roles: Set<MethodRole>;
  tags: Set<string>;
  comethod: boolean;
  coproblem: boolean;
}

const emptyFilters = (): FilterState => ({
  statuses: new Set(),
  difficulties: new Set(),
  roles: new Set(),
  tags: new Set(),
  comethod: true,
  coproblem: false,
});

const isFiltering = (f: FilterState) =>
  f.statuses.size > 0 ||
  f.difficulties.size > 0 ||
  f.roles.size > 0 ||
  f.tags.size > 0 ||
  !f.comethod ||
  f.coproblem;

function buildSim(methods: Method[], problems: Problem[], f: FilterState): SimModel {
  const mById = new Map(methods.map((m) => [m.id, m]));
  const pById = new Map(problems.map((p) => [p.id, p]));
  const hitTags = f.tags.size > 0;
  const hitStatus = f.statuses.size > 0;
  const hitDiff = f.difficulties.size > 0;
  const hitRole = f.roles.size > 0;
  const tagHit = (tags: string[]) => tags.some((t) => f.tags.has(t));

  const roleEdges: { m: Method; p: Problem; role: MethodRole }[] = [];
  for (const p of problems) {
    for (const l of p.methodLinks ?? []) {
      const m = mById.get(l.methodId);
      if (!m) continue;
      if (hitRole && !f.roles.has(l.role)) continue;
      roleEdges.push({ m, p, role: l.role });
    }
  }

  const visM = new Set<string>();
  const visP = new Set<string>();
  for (const m of methods) {
    if (!hitTags || tagHit(m.tags)) visM.add(m.id);
  }
  for (const p of problems) {
    if (hitStatus && !f.statuses.has(p.status)) continue;
    if (hitDiff && !f.difficulties.has(p.difficulty)) continue;
    if (hitTags && !tagHit(p.tags)) continue;
    visP.add(p.id);
  }
  if (hitTags) {
    for (const e of roleEdges) {
      if (visM.has(e.m.id) || visP.has(e.p.id)) {
        visM.add(e.m.id);
        visP.add(e.p.id);
      }
    }
  }

  const edges = roleEdges.filter((e) => visM.has(e.m.id) && visP.has(e.p.id));

  const nodes: SimNode[] = [];
  const byId = new Map<string, SimNode>();
  const mDeg = new Map<string, number>();
  const pDeg = new Map<string, number>();
  for (const e of edges) {
    mDeg.set(e.m.id, (mDeg.get(e.m.id) ?? 0) + 1);
    pDeg.set(e.p.id, (pDeg.get(e.p.id) ?? 0) + 1);
  }
  for (const id of visM) {
    const m = mById.get(id)!;
    const deg = mDeg.get(id) ?? 0;
    const n: SimNode = {
      id,
      type: "method",
      r: Math.min(34, 15 + Math.sqrt(deg) * 5),
      deg,
      label: m.name,
      tags: m.tags,
      community: -1,
      mastery: m.mastery?.level,
    };
    nodes.push(n);
    byId.set(id, n);
  }
  for (const id of visP) {
    const p = pById.get(id)!;
    const deg = pDeg.get(id) ?? 0;
    const n: SimNode = {
      id,
      type: "problem",
      r: Math.min(17, 9 + Math.sqrt(deg) * 2.6),
      deg,
      label: p.title || "未命名题目",
      tags: p.tags,
      community: -1,
      status: p.status,
      difficulty: p.difficulty,
    };
    nodes.push(n);
    byId.set(id, n);
  }

  const links: SimLink[] = [];
  const neighbors = new Map<string, Set<string>>();
  const addNb = (a: string, b: string) => {
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a)!.add(b);
    neighbors.get(b)!.add(a);
  };
  const addLink = (
    key: string,
    kind: SimLink["kind"],
    s: SimNode,
    t: SimNode,
    w: number,
    role?: MethodRole
  ) => {
    const jitter = hash2(s.id + t.id);
    const bendAmt = kind === "role" ? 0 : Math.min(64, 10 + w * 10);
    const side = jitter % 2 === 0 ? 1 : -1;
    links.push({
      key,
      kind,
      role,
      s,
      t,
      w,
      bend: v3(
        ((jitter % 97) / 97 - 0.5) * bendAmt * side * 2,
        ((jitter % 53) / 53 - 0.5) * bendAmt * 0.8,
        ((jitter % 71) / 71 - 0.5) * bendAmt * 2
      ),
    });
    addNb(s.id, t.id);
  };

  for (const e of edges) {
    addLink(
      "role:" + e.m.id + ":" + e.p.id,
      "role",
      byId.get(e.m.id)!,
      byId.get(e.p.id)!,
      1,
      e.role
    );
  }

  if (f.comethod) {
    const mProbs = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!mProbs.has(e.m.id)) mProbs.set(e.m.id, new Set());
      mProbs.get(e.m.id)!.add(e.p.id);
    }
    const ids = [...visM];
    const pairs: { a: string; b: string; w: number }[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const sa = mProbs.get(ids[i]);
        const sb = mProbs.get(ids[j]);
        let w = 0;
        if (sa && sb) {
          for (const x of sa) if (sb.has(x)) w++;
        }
        if (w >= 1) pairs.push({ a: ids[i], b: ids[j], w });
      }
    }
    pairs.sort((x, y) => y.w - x.w);
    for (const pr of pairs.slice(0, 160)) {
      addLink(
        "comethod:" + pr.a + ":" + pr.b,
        "comethod",
        byId.get(pr.a)!,
        byId.get(pr.b)!,
        pr.w
      );
    }
  }

  if (f.coproblem) {
    const pMeth = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!pMeth.has(e.p.id)) pMeth.set(e.p.id, new Set());
      pMeth.get(e.p.id)!.add(e.m.id);
    }
    const ids = [...visP];
    const pairs: { a: string; b: string; w: number }[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const sa = pMeth.get(ids[i]);
        const sb = pMeth.get(ids[j]);
        let w = 0;
        if (sa && sb) {
          for (const x of sa) if (sb.has(x)) w++;
        }
        if (w >= 2) pairs.push({ a: ids[i], b: ids[j], w });
      }
    }
    pairs.sort((x, y) => y.w - x.w);
    for (const pr of pairs.slice(0, 160)) {
      addLink(
        "coproblem:" + pr.a + ":" + pr.b,
        "coproblem",
        byId.get(pr.a)!,
        byId.get(pr.b)!,
        pr.w
      );
    }
  }

  /* 连通分量（社区） */
  const adj = new Map<string, string[]>();
  for (const l of links) {
    if (!adj.has(l.s.id)) adj.set(l.s.id, []);
    if (!adj.has(l.t.id)) adj.set(l.t.id, []);
    adj.get(l.s.id)!.push(l.t.id);
    adj.get(l.t.id)!.push(l.s.id);
  }
  let community = 0;
  for (const n of nodes) {
    if (n.community !== -1) continue;
    const stack = [n.id];
    n.community = community;
    while (stack.length) {
      const cur = stack.pop()!;
      for (const nb of adj.get(cur) ?? []) {
        const node = byId.get(nb);
        if (node && node.community === -1) {
          node.community = community;
          stack.push(nb);
        }
      }
    }
    community++;
  }

  return { nodes, links, byId, neighbors };
}

function hash2(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/* ---------- 三维布局 ---------- */

/* ---------- 机械布局 ---------- */

export interface MechLayout {
  goals: Map<string, V3>;
}

/**
 * 全景种子布局（社区感知）：连通分量=知识岛，每个社区占据一个
 * 角度扇区（扇区大小 ∝ 成员方法度数总和），岛内方法沿弧线排布；
 * 题目靠近其主方法（0.58 半径处）；力导向随后接管微调。
 */
function buildMechanical(sim: SimModel): MechLayout {
  const goals = new Map<string, V3>();

  // 题目入缸：优先核心角色关联的方法
  const assign = new Map<string, string>();
  for (const p of sim.nodes) {
    if (p.type !== "problem") continue;
    const roleLinks = sim.links.filter(
      (l) => l.kind === "role" && (l.s.id === p.id || l.t.id === p.id)
    );
    const core = roleLinks.find((l) => l.role === "core");
    const any = roleLinks[0];
    const pick = core ?? any;
    const mId = pick ? (pick.s.id === p.id ? pick.t.id : pick.s.id) : null;
    if (mId) assign.set(p.id, mId);
  }

  // 方法外环：按社区（连通分量）分扇区，扇区大小 ∝ 社区度数总和
  const ms = sim.nodes
    .filter((n) => n.type === "method")
    .sort((a, b) => b.deg - a.deg);
  const commWeight = new Map<number, number>();
  for (const m of ms) {
    commWeight.set(m.community, (commWeight.get(m.community) ?? 0) + m.deg + 1);
  }
  const comms = [...commWeight.entries()].sort((a, b) => b[1] - a[1]);
  const totalWeight = comms.reduce((s, [, w]) => s + w, 0) || 1;

  const R = 300;
  let angleCursor = Math.PI * 0.5;
  for (const [commId, weight] of comms) {
    const members = ms.filter((m) => m.community === commId);
    const span = (weight / totalWeight) * TAU;
    members.forEach((m, i) => {
      // 岛内方法沿扇区弧线排布（留出扇区边界空隙），枢纽靠扇区起始端
      const t = members.length <= 1 ? 0.5 : i / (members.length - 1);
      const a = angleCursor + span * (0.15 + 0.7 * t);
      goals.set(m.id, v3(Math.cos(a) * R, 0, Math.sin(a) * R));
    });
    angleCursor += span;
  }

  // 题目：靠近主方法（0.58 半径处 + 切线抖动）
  ms.forEach((m) => {
    const mPos = goals.get(m.id);
    if (!mPos) return;
    const mine = sim.nodes.filter(
      (p) => p.type === "problem" && assign.get(p.id) === m.id
    );
    const dir = norm3(mPos);
    const tangent = v3(-dir.z, 0, dir.x);
    mine.forEach((p, k) => {
      const jitter = (((hash2(p.id) % 100) / 100) - 0.5) * 90;
      goals.set(
        p.id,
        add3(add3(mul3(dir, R * 0.58), mul3(tangent, jitter)), v3(0, 0, ((k % 2) * 2 - 1) * 26))
      );
    });
  });

  // 无方法的题：内圈
  const loose = sim.nodes.filter(
    (n) => n.type === "problem" && !assign.has(n.id)
  );
  loose.forEach((p, i) => {
    const a = (i / Math.max(1, loose.length)) * TAU + 1;
    goals.set(p.id, v3(Math.cos(a) * 150, 0, Math.sin(a) * 150));
  });

  return { goals };
}

/** 内部结构布局：核心不动，邻居/解法/步骤环绕 */
function insideGoals(
  sim: SimModel,
  coreId: string,
  right: V3,
  up: V3,
  goals: Map<string, V3>,
  extra: ExtraOrb[],
  coreAsAny: { stepsLen?: number; sols?: { n: number; pal: Palette }[] }
) {
  const core = sim.byId.get(coreId);
  if (!core) return;
  const corePos = goals.get(coreId) ?? v3();
  const nb = [...(sim.neighbors.get(coreId) ?? new Set<string>())];
  extra.length = 0;

  if (core.type === "method") {
    const ringR = Math.max(core.r * 5.5, 150);
    nb.forEach((id, i) => {
      const a = (i / Math.max(1, nb.length)) * TAU + 0.4;
      goals.set(
        id,
        add3(corePos, add3(mul3(right, Math.cos(a) * ringR), mul3(up, Math.sin(a) * ringR)))
      );
    });
    // 步骤 = 正时齿轮链（核心下方弧线）
    const steps = coreAsAny.stepsLen ?? 0;
    if (steps > 0) {
      const r2 = ringR * 0.62;
      for (let i = 0; i < steps; i++) {
        const th = Math.PI * 0.55 + (i / Math.max(1, steps - 1)) * Math.PI * 0.9;
        const a = Math.PI * 0.5 + th;
        const pos = add3(
          corePos,
          add3(mul3(right, Math.cos(a) * r2), mul3(up, Math.sin(a) * r2 * 0.92))
        );
        extra.push({
          key: "step:" + coreId + ":" + i,
          cur: pos,
          goal: pos,
          r: 12,
          pal: PAL.step,
          kind: "step",
          from: i === 0 ? coreId : "step:" + coreId + ":" + (i - 1),
        });
      }
    }
  } else {
    const ringR = Math.max(core.r * 5, 130);
    nb.forEach((id, i) => {
      const a = (i / Math.max(1, nb.length)) * TAU + 0.25;
      goals.set(
        id,
        add3(corePos, add3(mul3(right, Math.cos(a) * ringR), mul3(up, Math.sin(a) * ringR)))
      );
    });
    // 解法 = 阀片组（内环）
    const sols = coreAsAny.sols ?? [];
    const r2 = ringR * 0.6;
    sols.forEach((s, i) => {
      const a = (i / Math.max(1, sols.length)) * TAU + 0.9;
      const pos = add3(
        corePos,
        add3(mul3(right, Math.cos(a) * r2), mul3(up, Math.sin(a) * r2))
      );
      extra.push({
        key: "sol:" + coreId + ":" + i,
        cur: pos,
        goal: pos,
        r: 10 + Math.min(6, s.n * 1.3),
        pal: s.pal,
        kind: "solution",
        from: coreId,
      });
    });
  }
}

export interface ExtraOrb {
  key: string;
  cur: V3;
  goal: V3;
  r: number;
  pal: Palette;
  kind: "step" | "solution";
  from: string;
}

export interface Node3 {
  cur: V3;
  goal: V3;
  alpha: number;
}

function insideNodeData(id: string, methods: Method[], problems: Problem[]) {
  const m = methods.find((x) => x.id === id);
  if (m) return { type: "method" as const, id, data: m };
  const p = problems.find((x) => x.id === id);
  if (p) return { type: "problem" as const, id, data: p };
  return null;
}

/* ---------- 组件 ---------- */

export function NetworkView({
  problems,
  methods,
  onOpenProblem,
  onOpenMethod,
}: NetworkViewProps) {
  const reduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [labelDensity, setLabelDensity] = useState<"key" | "all">("key");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [insideId, setInsideId] = useState<string | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);
  const zoomReadoutRef = useRef<HTMLSpanElement | null>(null);

  const sim = useMemo(
    () => buildSim(methods, problems, filters),
    [methods, problems, filters]
  );

  /* ---------- 引擎 refs ---------- */
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitElRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const nodeStoreRef = useRef<Map<string, Node3>>(new Map());
  const extraRef = useRef<ExtraOrb[]>([]);
  const layoutRef = useRef<MechLayout>({
    goals: new Map<string, V3>(),
  });
  const insideRef = useRef<{ coreId: string; right: V3; up: V3; xray: Set<string> } | null>(null);
  const lastInteractRef = useRef(0);
  const simRef = useRef<SimModel>(sim);
  const selectedRef = useRef<string | null>(null);
  const highlightRef = useRef<Set<string> | null>(null);
  const matchedRef = useRef<Set<string> | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const insideRef2 = useRef<string | null>(null);
  const reduceRef = useRef(reduceMotion);
  const dragRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  simRef.current = sim;
  selectedRef.current = selectedId;
  hoveredRef.current = hoverId;
  insideRef2.current = insideId;
  reduceRef.current = reduceMotion;

  /* ---------- ESC ---------- */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".sheet")) return; // 弹层自己处理 Esc
      if (insideRef2.current) setInsideId(null);
      else setSelectedId(null);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  /* ---------- 搜索 / 高亮 ---------- */
  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return { methods: [] as Method[], problems: [] as Problem[] };
    const ms = methods.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.signal || "").toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
    );
    const ps = problems.filter(
      (p) =>
        (p.title || "").toLowerCase().includes(q) ||
        (p.source || "").toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );
    return { methods: ms.slice(0, 8), problems: ps.slice(0, 8) };
  }, [q, methods, problems]);

  const matchedSet = useMemo(() => {
    if (!q) return null;
    const s = new Set<string>();
    for (const m of searchResults.methods) s.add(m.id);
    for (const p of searchResults.problems) s.add(p.id);
    return s;
  }, [q, searchResults]);

  const highlightSet = useMemo(() => {
    if (!selectedId) return null;
    const s = new Set<string>([selectedId]);
    const nb = sim.neighbors.get(selectedId);
    if (nb) for (const id of nb) s.add(id);
    return s;
  }, [selectedId, sim]);

  highlightRef.current = highlightSet;
  matchedRef.current = matchedSet;

  const isDim = (id: string) => {
    if (highlightSet && !highlightSet.has(id)) return true;
    if (matchedSet && !matchedSet.has(id)) return true;
    return false;
  };

  /* ---------- 数据变化 → 节点仓库 ---------- */
  useLayoutEffect(() => {
    const store = nodeStoreRef.current;
    const next = new Map<string, Node3>();
    const layout = buildMechanical(sim);
    layoutRef.current = layout;
    const goals = layout.goals;
    for (const n of sim.nodes) {
      const old = store.get(n.id);
      if (old) {
        next.set(n.id, { cur: old.cur, goal: goals.get(n.id) ?? old.cur, alpha: 1 });
      } else {
        const g = goals.get(n.id) ?? v3();
        next.set(n.id, { cur: g, goal: g, alpha: reduceRef.current ? 1 : 0 });
      }
    }
    nodeStoreRef.current = next;
  }, [sim]);

  /* ---------- 相机飞行 ---------- */
  const flyTo = useCallback((target: V3, dist: number, durMs: number, dive = false) => {
    engineApiRef.current?.flyTo(target, dist, durMs, dive);
  }, []);

  const setOverviewLayout = useCallback(() => {
    const layout = buildMechanical(simRef.current);
    layoutRef.current = layout;
    const store = nodeStoreRef.current;
    for (const [id, s] of store) {
      s.goal = layout.goals.get(id) ?? s.goal;
    }
    extraRef.current = [];
    engineApiRef.current?.relax();
  }, []);

  const dive = useCallback(
    (id: string) => {
      const s = simRef.current;
      const node = s.byId.get(id);
      if (!node) return;
      const st = nodeStoreRef.current.get(id);
      const pos = engineApiRef.current?.getPos(id) ?? st?.cur ?? v3();
      setSelectedId(id);
      setInsideId(id);
      const cs = camStateRef.current;
      let fwd = v3(0, 0, 1);
      let right = v3(1, 0, 0);
      let up = v3(0, 1, 0);
      if (cs) {
        const cy = Math.cos(cs.pitch);
        const sy = Math.sin(cs.pitch);
        const cx = Math.cos(cs.yaw);
        const sx = Math.sin(cs.yaw);
        const ex = cs.target.x + cs.dist * cy * sx;
        const ey = cs.target.y + cs.dist * sy;
        const ez = cs.target.z + cs.dist * cy * cx;
        fwd = norm3(v3(cs.target.x - ex, cs.target.y - ey, cs.target.z - ez));
        right = norm3(cross3(fwd, v3(0, 1, 0)));
        up = cross3(right, fwd);
      }
      // 外壳化对象：核心节点
      const xray = new Set<string>([id]);
      insideRef.current = { coreId: id, right, up, xray };
      const goals = new Map<string, V3>();
      for (const [nid, st2] of nodeStoreRef.current) {
        goals.set(nid, st2.cur);
      }
      goals.set(id, pos);
      const extra: ExtraOrb[] = [];
      const item =
        node.type === "method"
          ? methods.find((m) => m.id === id)
          : problems.find((p) => p.id === id);
      const coreAsAny: { stepsLen?: number; sols?: { n: number; pal: Palette }[] } = {};
      if (item && node.type === "method") {
        coreAsAny.stepsLen = (item as Method).steps.length;
      }
      if (item && node.type === "problem") {
        coreAsAny.sols = (item as Problem).solutions.map((so) => ({
          n: so.steps.length,
          pal: so.simplicity === 1 ? PAL.solved : so.simplicity === 3 ? PAL.stuck : PAL.todo,
        }));
      }
      insideGoals(simRef.current, id, right, up, goals, extra, coreAsAny);
      for (const [nid, g] of goals) {
        const st2 = nodeStoreRef.current.get(nid);
        if (st2) st2.goal = g;
      }
      extraRef.current = extra;
      const dist = Math.max(node.r * 8, 380);
      flyTo(pos, dist, 1200, true);
    },
    [methods, problems, flyTo]
  );

  const exitInside = useCallback(() => {
    setInsideId(null);
    insideRef.current = null;
    setOverviewLayout();
    flyTo(v3(0, 34, 0), DEFAULT_DIST, 1000, false);
  }, [flyTo, setOverviewLayout]);

  // 进入内部后节点被删 → 退出
  useEffect(() => {
    if (!insideId) return;
    if (!sim.byId.has(insideId)) setInsideId(null);
  }, [insideId, sim]);

  // 选中项被删自动清空
  useEffect(() => {
    if (!selectedId) return;
    if (!sim.byId.has(selectedId)) setSelectedId(null);
  }, [selectedId, sim]);

  // 退出内部后恢复全景布局
  useEffect(() => {
    if (!insideId) setOverviewLayout();
  }, [insideId, setOverviewLayout]);

  // 演示模式 API：App 的 F9 演示序列会调用飞入/退出
  useEffect(() => {
    const w = window as unknown as { __demoApi?: Record<string, (id?: string) => void> };
    w.__demoApi = w.__demoApi ?? {};
    w.__demoApi.networkDive = (id?: string) => {
      if (id) dive(id);
    };
    w.__demoApi.networkExit = () => {
      if (insideRef2.current) exitInside();
    };
    return () => {
      delete w.__demoApi?.networkDive;
      delete w.__demoApi?.networkExit;
    };
  }, [dive, exitInside]);

  /* ---------- three.js 引擎 ---------- */
  const engineApiRef = useRef<EngineApi | null>(null);
  const camStateRef = useRef<EngineCamState | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const engine = createEngine(canvas, stage, {
      layoutRef,
      nodeStoreRef,
      insideRef,
      extraRef,
      simRef,
      selectedRef,
      highlightRef,
      matchedRef,
      hoveredRef,
      insideRef2,
      reduceRef,
      hitElRef,
      zoomReadoutRef,
      lastInteractRef,
      setZoomedIn,
      camStateRef,
    });
    engineApiRef.current = engine;
    engine.rebuild();
    return () => {
      engineApiRef.current = null;
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineApiRef.current?.rebuild();
  }, [sim]);

  useEffect(() => {
    engineApiRef.current?.applyInside();
  }, [insideId]);

  /* ---------- 舞台交互 ---------- */
  const onStagePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const t = e.target as Element;
    if (t.closest(".network-node") || t.closest(".network-inside")) return;
    lastInteractRef.current = performance.now();
    dragRef.current = { x: e.clientX, y: e.clientY, yaw: 0, pitch: 0 };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onStagePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    engineApiRef.current?.dragStage(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX;
    d.y = e.clientY;
  };

  const onStagePointerUp = () => {
    dragRef.current = null;
  };

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      engineApiRef.current?.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  /* ---------- 节点拖拽（地面平面内） ---------- */
  const nodeDragRef = useRef<{ id: string; moved: boolean; startX: number; startY: number } | null>(null);
  const dragMovedRef = useRef(false);

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    lastInteractRef.current = performance.now();
    nodeDragRef.current = { id, moved: false, startX: e.clientX, startY: e.clientY };
    dragMovedRef.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onNodePointerMove = (e: React.PointerEvent, id: string) => {
    const d = nodeDragRef.current;
    if (!d || d.id !== id) return;
    const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.moved && moved > 6) d.moved = true;
    if (d.moved) {
      dragMovedRef.current = true;
      engineApiRef.current?.dragNode(id, e.clientX, e.clientY);
      lastInteractRef.current = performance.now();
    }
  };

  const onNodePointerUp = (e: React.PointerEvent) => {
    nodeDragRef.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  const onNodeClick = (id: string) => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    setSelectedId((cur) => (cur === id ? null : id));
  };

  const onNodeDoubleClick = (id: string) => {
    dragMovedRef.current = false;
    dive(id);
  };

  /* ---------- 定位 / 适配 ---------- */
  const locate = useCallback(
    (id: string) => {
      const pos = engineApiRef.current?.getPos(id);
      if (!pos) return;
      setSelectedId(id);
      flyTo(pos, 800, 950, false);
    },
    [flyTo]
  );

  const fitView = useCallback(() => {
    const b = engineApiRef.current?.getBounds();
    if (!b) return;
    const dist = Math.min(
      MAX_DIST,
      Math.max(MIN_DIST, (b.radius / Math.tan((FOV * Math.PI) / 360)) * 1.3)
    );
    flyTo(v3(b.center.x, b.center.y + 10, b.center.z), dist, 900, false);
  }, [flyTo]);

  const resetView = useCallback(() => {
    exitInside();
    setOverviewLayout();
    flyTo(v3(0, 34, 0), DEFAULT_DIST, 950, false);
  }, [exitInside, setOverviewLayout, flyTo]);

  /* ---------- 筛选工具 ---------- */
  const allTags = useMemo(() => {
    const s = new Set<string>();
    for (const m of methods) for (const t of m.tags) s.add(t);
    for (const p of problems) for (const t of p.tags) s.add(t);
    return [...s].sort((a, b) => a.localeCompare(b, "zh"));
  }, [methods, problems]);

  const toggleIn = useCallback(function <K>(set: Set<K>, v: K) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(emptyFilters());
    resetView();
  }, [resetView]);

  /* ---------- 悬停提示 ---------- */
  const moveTooltip = useCallback((e: React.PointerEvent) => {
    const tip = tooltipRef.current;
    const stage = stageRef.current;
    if (!tip || !stage) return;
    const r = stage.getBoundingClientRect();
    tip.style.left = e.clientX - r.left + 16 + "px";
    tip.style.top = e.clientY - r.top + 14 + "px";
  }, []);

  const hoverNode = hoverId ? sim.byId.get(hoverId) ?? null : null;

  /* ---------- 信息面板数据 ---------- */
  const selectedNode = selectedId ? sim.byId.get(selectedId) ?? null : null;
  const selectedItem = selectedNode
    ? selectedNode.type === "method"
      ? methods.find((m) => m.id === selectedNode.id) ?? null
      : problems.find((p) => p.id === selectedNode.id) ?? null
    : null;
  const neighborItems = useMemo(() => {
    if (!selectedNode) return { methods: [] as Method[], problems: [] as Problem[] };
    const ids = sim.neighbors.get(selectedNode.id) ?? new Set<string>();
    return {
      methods: methods.filter((m) => ids.has(m.id)),
      problems: problems.filter((p) => ids.has(p.id)),
    };
  }, [selectedNode, sim, methods, problems]);

  /* ---------- 内部结构数据 ---------- */
  const insideItem = useMemo(
    () => (insideId ? insideNodeData(insideId, methods, problems) : null),
    [insideId, methods, problems]
  );
  const [insideThumbs, setInsideThumbs] = useState<string[]>([]);
  useEffect(() => {
    const urls: string[] = [];
    if (insideItem) {
      if (insideItem.type === "method") {
        for (const im of (insideItem.data as Method).images.slice(0, 3)) {
          urls.push(URL.createObjectURL(im.blob));
        }
      } else {
        for (const im of (insideItem.data as Problem).images.slice(0, 3)) {
          urls.push(URL.createObjectURL(im.blob));
        }
      }
    }
    setInsideThumbs(urls);
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [insideItem]);

  /* ---------- 空态 ---------- */
  if (methods.length === 0) {
    return (
      <div className="network-view">
        <NetworkHeader problems={problems} methods={methods} links={sim.links} />
        <Empty
          icon={<Network size={28} />}
          title="还没有方法"
          description="先去「方法库」沉淀几招，回来这里就有网可看。"
        />
      </div>
    );
  }
  const noData = sim.links.length === 0;
  if (noData) {
    return (
      <div className="network-view">
        <NetworkHeader problems={problems} methods={methods} links={sim.links} />
        <Empty
          icon={<Network size={28} />}
          title={isFiltering(filters) ? "当前筛选下没有关联" : "尚无关联"}
          description={
            isFiltering(filters)
              ? "换个筛选条件，或点「重置筛选」回到完整网络。"
              : "在题目详情的「关联方法」里加入方法，网络会自动生成。"
          }
          action={
            isFiltering(filters) ? (
              <button className="btn btn-primary" onClick={resetFilters}>
                重置筛选
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const roleCount = sim.links.filter((l) => l.kind === "role").length;
  const coMethodCount = sim.links.filter((l) => l.kind === "comethod").length;
  const coProblemCount = sim.links.filter((l) => l.kind === "coproblem").length;
  const nodeMethodCount = sim.nodes.filter((n) => n.type === "method").length;
  const nodeProblemCount = sim.nodes.filter((n) => n.type === "problem").length;

  return (
    <div className="network-view">
      <NetworkHeader problems={problems} methods={methods} links={sim.links} />

      <div className="network-toolbar">
        <div className="network-search">
          <Search size={15} />
          <input
            className="input"
            placeholder="搜索方法 / 题目 / 标签，回车定位…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const first = searchResults.methods[0] ?? searchResults.problems[0];
                if (first) locate(first.id);
              }
            }}
            aria-label="搜索节点"
          />
          {query && (
            <button className="icon-btn" aria-label="清除" onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
          {q &&
            (searchResults.methods.length > 0 || searchResults.problems.length > 0) && (
              <div className="network-results">
                {searchResults.methods.length > 0 && (
                  <div className="network-results-group">
                    <p className="network-results-head">方法</p>
                    {searchResults.methods.map((m) => (
                      <button
                        key={m.id}
                        className="network-result"
                        onClick={() => {
                          locate(m.id);
                          setQuery("");
                        }}
                      >
                        <i className="dot method" />
                        <span className="network-result-name">{m.name}</span>
                        <span className="muted">{sim.byId.get(m.id)?.deg ?? 0} 题</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.problems.length > 0 && (
                  <div className="network-results-group">
                    <p className="network-results-head">题目</p>
                    {searchResults.problems.map((p) => (
                      <button
                        key={p.id}
                        className="network-result"
                        onClick={() => {
                          locate(p.id);
                          setQuery("");
                        }}
                      >
                        <i className={"dot s-" + p.status} />
                        <span className="network-result-name">{p.title || "未命名题目"}</span>
                        <span className="muted">{sim.byId.get(p.id)?.deg ?? 0} 方法</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
        </div>

        <div className="network-sort" role="tablist" aria-label="标签密度">
          {(
            [
              ["key", "关键标签"],
              ["all", "全部标签"],
            ] as [typeof labelDensity, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={labelDensity === v}
              className={"network-sort-btn" + (labelDensity === v ? " active" : "")}
              onClick={() => setLabelDensity(v)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="network-zoom">
          <button
            className="btn btn-ghost"
            onClick={() => engineApiRef.current?.zoomBy(1.25)}
            aria-label="缩小"
          >
            −
          </button>
          <span className="muted network-zoom-readout" ref={zoomReadoutRef}>
            100%
          </span>
          <button
            className="btn btn-ghost"
            onClick={() => engineApiRef.current?.zoomBy(1 / 1.25)}
            aria-label="放大"
          >
            +
          </button>
          <button className="btn btn-ghost" onClick={fitView}>
            适配
          </button>
          <button className="btn btn-ghost" onClick={resetView}>
            重置
          </button>
        </div>
      </div>

      <div className="network-filters">
        <div className="network-filter-row">
          <span className="network-filter-label">状态</span>
          {STATUSES.map((s) => (
            <button
              key={s}
              className={"filter-chip s-" + s + (filters.statuses.has(s) ? " active" : "")}
              onClick={() =>
                setFilters((f) => ({ ...f, statuses: toggleIn(f.statuses, s) }))
              }
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
          <span className="network-filter-sep" aria-hidden="true" />
          <span className="network-filter-label">难度</span>
          {DIFFS.map((d) => (
            <button
              key={d}
              className={"filter-chip" + (filters.difficulties.has(d) ? " active" : "")}
              onClick={() =>
                setFilters((f) => ({ ...f, difficulties: toggleIn(f.difficulties, d) }))
              }
            >
              {d}★
            </button>
          ))}
          <span className="network-filter-sep" aria-hidden="true" />
          <span className="network-filter-label">角色</span>
          {ROLES.map((r) => (
            <button
              key={r}
              className={"filter-chip role-" + r + (filters.roles.has(r) ? " active" : "")}
              onClick={() =>
                setFilters((f) => ({ ...f, roles: toggleIn(f.roles, r) }))
              }
            >
              {ROLE_LABEL[r].replace("方法", "")}
            </button>
          ))}
        </div>
        <div className="network-filter-row">
          <span className="network-filter-label">推导边</span>
          <button
            className={"filter-chip derived" + (filters.comethod ? " active" : "")}
            onClick={() => setFilters((f) => ({ ...f, comethod: !f.comethod }))}
          >
            <Sparkle size={12} />
            方法共题
          </button>
          <button
            className={"filter-chip derived" + (filters.coproblem ? " active" : "")}
            onClick={() => setFilters((f) => ({ ...f, coproblem: !f.coproblem }))}
          >
            <Sparkle size={12} />
            题目共法
          </button>
          <span className="network-filter-sep" aria-hidden="true" />
          <span className="network-filter-label">标签</span>
          <div className="network-tag-chips">
            {allTags.map((t) => (
              <button
                key={t}
                className={"filter-chip tag" + (filters.tags.has(t) ? " active" : "")}
                onClick={() =>
                  setFilters((f) => ({ ...f, tags: toggleIn(f.tags, t) }))
                }
              >
                {filters.tags.has(t) && <Check size={11} />}
                {t}
              </button>
            ))}
          </div>
          {isFiltering(filters) && (
            <button className="btn btn-ghost network-filter-reset" onClick={resetFilters}>
              重置筛选
            </button>
          )}
        </div>
      </div>

      <div className="network-legend">
        <span className="legend-item">
          <i className="dot method" />
          方法（蓝=熟练 · 橙=掌握度低）
        </span>
        <span className="legend-item">
          <i className="dot s-todo" />
          待做
        </span>
        <span className="legend-item">
          <i className="dot s-solved" />
          已解
        </span>
        <span className="legend-item">
          <i className="dot s-stuck" />
          卡住
        </span>
        <span className="legend-item">
          <i className="edge-key role-core" />
          核心
        </span>
        <span className="legend-item">
          <i className="edge-key role-auxiliary" />
          辅助
        </span>
        <span className="legend-item">
          <i className="edge-key role-extension" />
          延伸
        </span>
        <span className="legend-item">
          <i className="edge-key derived-method" />
          方法共题
        </span>
        <span className="muted network-stat">
          {nodeMethodCount} 方法 · {nodeProblemCount} 题 · {roleCount} 关联
          {coMethodCount > 0 && <> · {coMethodCount} 共题边</>}
          {coProblemCount > 0 && <> · {coProblemCount} 相似边</>}
        </span>
      </div>

      <div className="network-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className="network-canvas"
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerLeave={onStagePointerUp}
          aria-label="方法与题目关联网络三维舞台"
        />

        {sim.nodes.map((n) => {
          const isSelected = selectedId === n.id;
          const dim = isDim(n.id);
          const isNeighbor =
            insideId != null && (sim.neighbors.get(insideId) ?? new Set()).has(n.id);
          // 关键标签：枢纽方法（被 ≥2 题使用）+ 选中/邻域；全部标签：所有方法
          const showLabel =
            n.type === "method"
              ? labelDensity === "all" || isSelected || isNeighbor || n.deg >= 2
              : zoomedIn || isSelected || isNeighbor;
          const cls = [
            "network-node",
            n.type,
            n.status ? "s-" + n.status : "",
            isSelected ? "selected" : "",
            dim ? "dim" : "",
            hoverId === n.id ? "hovered" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <div
              key={n.id}
              ref={(el) => {
                if (el) hitElRef.current.set(n.id, el);
                else hitElRef.current.delete(n.id);
              }}
              className={cls}
              style={{ display: "none" }}
              onPointerDown={(e) => onNodePointerDown(e, n.id)}
              onPointerMove={(e) => {
                onNodePointerMove(e, n.id);
                moveTooltip(e);
              }}
              onPointerUp={(e) => onNodePointerUp(e)}
              onPointerEnter={(e) => {
                setHoverId(n.id);
                moveTooltip(e);
              }}
              onPointerLeave={() => setHoverId(null)}
              onClick={() => onNodeClick(n.id)}
              onDoubleClick={() => onNodeDoubleClick(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedId((cur) => (cur === n.id ? null : n.id));
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={(n.type === "method" ? "方法：" : "题目：") + n.label}
            >
              {showLabel && (
                <span className="net-label">
                  {n.label.length > 13 ? n.label.slice(0, 12) + "…" : n.label}
                </span>
              )}
            </div>
          );
        })}

        <div
          ref={tooltipRef}
          className={"network-tooltip" + (hoverNode ? " visible" : "")}
          aria-hidden={hoverNode ? undefined : true}
        >
          {hoverNode && (
            <>
              <span className="network-tooltip-kind">
                {hoverNode.type === "method" ? "方法" : "题目"}
              </span>
              <span className="network-tooltip-name">{hoverNode.label}</span>
              <span className="network-tooltip-sub">
                {hoverNode.type === "method"
                  ? "被 " + hoverNode.deg + " 道题使用 · 双击拆壳"
                  : hoverNode.deg + " 个方法 · " + STATUS_LABEL[hoverNode.status ?? "todo"] + " · 双击拆壳"}
              </span>
            </>
          )}
        </div>

        {!insideId && (
          <div className="network-hint">
            拖动旋转 · 滚轮缩放 · <b>单击查看关联 · 双击进入节点内部结构</b>
          </div>
        )}

        {insideId && insideItem && (
          <InsidePanel
            item={insideItem}
            neighbors={
              insideItem.type === "method" ? neighborItems.problems : neighborItems.methods
            }
            onOpen={() =>
              insideItem.type === "method"
                ? onOpenMethod(insideItem.id)
                : onOpenProblem(insideItem.id)
            }
            onJump={(id) => dive(id)}
            onBack={exitInside}
            blobUrls={insideThumbs}
          />
        )}
      </div>

      <div className="network-info" aria-live="polite">
        {selectedNode && selectedItem ? (
          <>
            <div className="network-info-main">
              <span className={"network-info-kind " + selectedNode.type}>
                {selectedNode.type === "method" ? "方法" : "题目"}
              </span>
              <span className="network-info-name">
                {selectedNode.type === "method"
                  ? (selectedItem as Method).name
                  : (selectedItem as Problem).title || "未命名题目"}
              </span>
              <span className="muted network-info-sub">
                {selectedNode.type === "method"
                  ? "被 " +
                    selectedNode.deg +
                    " 道题使用 · " +
                    (selectedNode.mastery
                      ? ["", "了解", "会用", "熟练", "精通", "融会贯通"][selectedNode.mastery]
                      : "未设掌握度")
                  : "使用 " +
                    selectedNode.deg +
                    " 个方法 · " +
                    STATUS_LABEL[(selectedItem as Problem).status] +
                    " · 难度 " +
                    (selectedItem as Problem).difficulty +
                    "/5"}
              </span>
              {selectedItem.tags && selectedItem.tags.length > 0 && (
                <span className="network-info-tags">
                  {selectedItem.tags.slice(0, 5).map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                </span>
              )}
            </div>
            {(neighborItems.methods.length > 0 || neighborItems.problems.length > 0) && (
              <div className="network-info-neighbors">
                {neighborItems.methods.length > 0 && (
                  <>
                    <span className="network-info-neighbor-label">用到的方法</span>
                    {neighborItems.methods.slice(0, 6).map((m) => (
                      <button key={m.id} className="chip chip-btn" onClick={() => locate(m.id)}>
                        {m.name}
                      </button>
                    ))}
                    {neighborItems.methods.length > 6 && (
                      <span className="muted">+{neighborItems.methods.length - 6}</span>
                    )}
                  </>
                )}
                {neighborItems.problems.length > 0 && (
                  <>
                    <span className="network-info-neighbor-label">关联题目</span>
                    {neighborItems.problems.slice(0, 6).map((p) => (
                      <button key={p.id} className="chip chip-btn" onClick={() => locate(p.id)}>
                        {p.title || "未命名题目"}
                      </button>
                    ))}
                    {neighborItems.problems.length > 6 && (
                      <span className="muted">+{neighborItems.problems.length - 6}</span>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="network-info-actions">
              <button
                className="btn btn-primary"
                onClick={() =>
                  selectedNode.type === "method"
                    ? onOpenMethod(selectedNode.id)
                    : onOpenProblem(selectedNode.id)
                }
              >
                打开详情
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => selectedNode && dive(selectedNode.id)}
              >
                进入内部结构
              </button>
              <button className="btn btn-ghost" onClick={() => setSelectedId(null)}>
                取消选择（Esc）
              </button>
            </div>
          </>
        ) : (
          <span className="muted">
            单击看关联 · 双击飞入内部结构 · 拖拽旋转 · 滚轮缩放 · 回车定位搜索
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- 内部结构面板 ---------- */

function InsidePanel({
  item,
  neighbors,
  onOpen,
  onJump,
  onBack,
  blobUrls,
}: {
  item: { type: "method" | "problem"; id: string; data: Method | Problem };
  neighbors: (Method | Problem)[];
  onOpen: () => void;
  onJump: (id: string) => void;
  onBack: () => void;
  blobUrls: string[];
}) {
  const isMethod = item.type === "method";
  const method = item.data as Method;
  const problem = item.data as Problem;
  return (
    <div className="network-inside" role="dialog" aria-label="内部结构">
      <div className="network-inside-head">
        <span className="network-inside-kind">
          {isMethod ? "方法内部" : "题目内部"}
        </span>
        <h3 className="network-inside-name">
          {isMethod ? method.name : problem.title || "未命名题目"}
        </h3>
        <span className="network-inside-sub">
          {isMethod
            ? (method.mastery
                ? ["", "了解", "会用", "熟练", "精通", "融会贯通"][method.mastery.level]
                : "未设掌握度") + " · " + (method.signal ? "适用信号" : "暂无信号")
            : STATUS_LABEL[problem.status] +
              " · 难度 " +
              problem.difficulty +
              "/5 · " +
              problem.solutions.length +
              " 组解法"}
        </span>
      </div>

      {isMethod && method.signal && (
        <div className="network-inside-section">
          <span className="network-inside-label">适用信号</span>
          <p className="network-inside-text">{method.signal}</p>
        </div>
      )}

      {isMethod && method.steps.length > 0 && (
        <div className="network-inside-section">
          <span className="network-inside-label">操作步骤 · {method.steps.length}</span>
          <ol className="network-inside-steps">
            {method.steps.map((s, i) => (
              <li key={i} className="network-inside-step">
                <i>{i + 1}</i>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {!isMethod && problem.solutions.length > 0 && (
        <div className="network-inside-section">
          <span className="network-inside-label">解法 · {problem.solutions.length} 组</span>
          <div className="network-inside-solutions">
            {problem.solutions.map((s) => (
              <div key={s.id} className="network-inside-solution">
                <span className="network-inside-solution-name">
                  {s.label || "解法"}
                  {s.clever && <em className="network-inside-clever">妙解</em>}
                </span>
                <span className="network-inside-solution-meta">
                  {SIMPLICITY_LABEL[s.simplicity]} · {s.steps.length} 步
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isMethod && method.pitfalls && (
        <div className="network-inside-section">
          <span className="network-inside-label">易错点</span>
          <p className="network-inside-text">{method.pitfalls}</p>
        </div>
      )}

      {neighbors.length > 0 && (
        <div className="network-inside-section">
          <span className="network-inside-label">
            {isMethod ? "关联题目" : "用到的方法"} · {neighbors.length}
          </span>
          <div className="network-inside-chips">
            {neighbors.slice(0, 8).map((x) => (
              <button key={x.id} className="network-inside-chip" onClick={() => onJump(x.id)}>
                {"title" in x ? x.title || "未命名题目" : x.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {blobUrls.length > 0 && (
        <div className="network-inside-section">
          <span className="network-inside-label">图片</span>
          <div className="network-inside-thumbs">
            {blobUrls.map((u, i) => (
              <img key={i} src={u} alt={"图片 " + (i + 1)} />
            ))}
          </div>
        </div>
      )}

      <div className="network-inside-actions">
        <button className="btn btn-primary" onClick={onOpen}>
          打开详情
        </button>
        <button className="btn btn-ghost" onClick={onBack}>
          返回全景（Esc）
        </button>
      </div>
    </div>
  );
}

function NetworkHeader({
  problems,
  methods,
  links,
}: {
  problems: Problem[];
  methods: Method[];
  links: SimLink[];
}) {
  return (
    <div className="page-head network-head">
      <div>
        <h1 className="page-title">招式网络</h1>
        <p className="page-sub">
          方法与题库装配成一台招式引擎：缸体是方法、活塞是题目，双击拆开机匣，看清每一层内部结构。
        </p>
      </div>
      <div className="network-head-stats">
        <span>
          <strong>{methods.length}</strong> 方法
        </span>
        <span>
          <strong>{problems.length}</strong> 题
        </span>
        <span>
          <strong>{links.filter((l) => l.kind === "role").length}</strong> 关联
        </span>
        <span>
          <strong>{links.filter((l) => l.kind === "comethod").length}</strong> 共题
        </span>
      </div>
    </div>
  );
}
