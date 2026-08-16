import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import type { Method, Problem, ProblemDraft, ProblemStatus } from "./types";
import { freshReview } from "./types";
import { useStore } from "./hooks/useStore";
import { ParticleBackground } from "./components/ParticleBackground";
import { CardGridSkeleton, Skeleton } from "./components/ui/Skeleton";
import { Sidebar, type Theme, type View } from "./components/Sidebar";
import { MobileTabBar } from "./components/MobileTabBar";
import { Library } from "./components/Library";
import { CleverLibrary } from "./components/CleverLibrary";
import { ReviewLibrary } from "./components/ReviewLibrary";
import { HardReviewLibrary } from "./components/HardReviewLibrary";
// 招式网络包含 three.js，按需加载以保持首屏轻快
const NetworkView = lazy(() =>
  import("./components/NetworkView").then((m) => ({ default: m.NetworkView }))
);
import { ReportPage } from "./components/ReportPage";
import { QrSheet } from "./components/QrSheet";
import type { BackupPreview } from "./components/BackupSheet";
import { ProblemDetailSheet } from "./components/ProblemDetailSheet";
import { ProblemFormSheet } from "./components/ProblemFormSheet";
import { MethodLibrary } from "./components/MethodLibrary";
import { MethodDetailSheet } from "./components/MethodDetailSheet";
import { MethodFormSheet } from "./components/MethodFormSheet";
import { TagsPage } from "./components/TagsPage";
import { BackupSheet } from "./components/BackupSheet";
import { Lightbox } from "./components/ui/Lightbox";
import { Clock, Cloud } from "./components/ui/icons";
import { logEvent } from "./db/events";
import { localStateTime } from "./utils/stateTime";
import {
  getBackupDirHandle,
  getLastLocalBackup,
  loadLocalSyncConfig,
  runLocalBackup,
  setLastLocalError,
} from "./db/localSync";
import {
  bridgeDownload,
  bridgeInfo,
  bridgeUpload,
  getBridgeLastSync,
  setBridgeLastSync,
} from "./db/bridge";
import { applyBackupSettings, type BackupSettings } from "./db/settings";
import { methodNeedsReview } from "./utils/review";
import {
  backupFileToData,
  buildBackupBlob,
  downloadBlob,
  exportProblemImages,
} from "./db/backup";

type ThemeChoice = Theme;
const THEME_CYCLE: ThemeChoice[] = ["system", "light", "dark"];
const IS_DESKTOP_HOST = ["localhost", "127.0.0.1"].includes(window.location.hostname);

function ViewFade({ viewKey, children }: { viewKey: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewKey}
        className="view-fade"
        initial={
          reduce
            ? { opacity: 0 }
            : { opacity: 0, y: 24, scale: 0.985, rotateX: 3, transformPerspective: 1300, filter: "blur(8px)" }
        }
        animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0, filter: "blur(0px)" }}
        exit={
          reduce
            ? { opacity: 0 }
            : { opacity: 0, y: -16, scale: 0.985, rotateX: -2, transformPerspective: 1300, filter: "blur(8px)" }
        }
        transition={
          reduce ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
        }
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

interface FormState {
  open: boolean;
  initial: Problem | null;
}

interface MethodFormState {
  open: boolean;
  initial: Method | null;
}

export default function App() {
  const store = useStore();
  const [view, setView] = useState<View>("library");
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const saved = localStorage.getItem("mb-theme");
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ open: false, initial: null });
  const [methodForm, setMethodForm] = useState<MethodFormState>({ open: false, initial: null });
  const [methodDetailId, setMethodDetailId] = useState<string | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    src: string;
    caption: string;
    downloadName?: string;
  } | null>(null);
  const [backupReminder, setBackupReminder] = useState<number | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [bridgeUpdate, setBridgeUpdate] = useState(false);
  const [demo, setDemo] = useState(false);
  const demoRef = useRef(false);
  const demoRunRef = useRef(0);
  const [portWarnDismissed, setPortWarnDismissed] = useState(false);
  const localBackupRef = useRef(false);
  const localBackoffRef = useRef({ nextAt: 0, fails: 0 });
  const bridgeBusyRef = useRef(false);
  const bridgeCooldownRef = useRef(0);
  const bridgeInitRef = useRef(false);

  const maybeLocalBackup = useCallback(
    async (problems: Problem[], methods: Method[]) => {
      const cfg = loadLocalSyncConfig();
      if (!cfg.enabled) return;
      // 失败后指数退避：5min → 10min → 20min → 30min（封顶）
      if (Date.now() < localBackoffRef.current.nextAt) return;
      const handle = await getBackupDirHandle();
      if (!handle) return;
      const last = getLastLocalBackup();
      if (last && localStateTime(problems, methods) <= last.at) return;
      if (localBackupRef.current) return;
      localBackupRef.current = true;
      try {
        await runLocalBackup(handle, problems, methods, cfg.keepCount, () => {});
        localBackoffRef.current = { nextAt: 0, fails: 0 };
      } catch (e) {
        setLastLocalError((e as Error).message || "本地自动备份失败");
        const fails = localBackoffRef.current.fails + 1;
        const waitMin = Math.min(30, 5 * Math.pow(2, fails - 1));
        localBackoffRef.current = { nextAt: Date.now() + waitMin * 60_000, fails };
      } finally {
        localBackupRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    const last = Number(localStorage.getItem("mb-last-backup") || 0);
    if (!last) return;
    const days = Math.floor((Date.now() - last) / 86400000);
    if (days >= 7 && !sessionStorage.getItem("mb-backup-reminder-dismissed")) {
      setBackupReminder(days);
    }
  }, []);

  // 记录“打开题目”动作，用于活跃度统计（同一题一小时内只记一次）
  useEffect(() => {
    if (!selectedId) return;
    void logEvent("open", { problemId: selectedId });
  }, [selectedId]);

  // 打开应用时自动做一次本地备份
  useEffect(() => {
    if (!store.ready) return;
    void maybeLocalBackup(store.problems, store.methods);
  }, [store.ready, maybeLocalBackup]);

  // 页面重新可见时立刻尝试一次本地备份（覆盖“编辑后切走再回来”的场景）
  useEffect(() => {
    if (!store.ready) return;
    const onVis = () => {
      if (!document.hidden) void maybeLocalBackup(store.problems, store.methods);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [store.ready, store.problems, store.methods, maybeLocalBackup]);

  // 局域网设备同步：全新设备自动拉取，其他情况按时间判断
  useEffect(() => {
    if (!store.ready || bridgeInitRef.current) return;
    bridgeInitRef.current = true;
    void (async () => {
      if (bridgeBusyRef.current) return;
      bridgeBusyRef.current = true;
      try {
        const info = await bridgeInfo();
        if (!info.exists) {
          if (store.problems.length > 0) {
            const { blob } = await buildBackupBlob(() => {});
            await bridgeUpload(blob);
            setBridgeLastSync();
          }
          return;
        }
        if (store.seeded) {
          const blob = await bridgeDownload();
          const data = await backupFileToData(blob as File, () => {});
          // 桥是空备份（例如其他设备刚清空）：不要用它抹掉本机刚播种的数据，
          // 而是把本地种子数据作为初始内容推送上去并完成首次同步。
          if (data.problems.length === 0 && data.methods.length === 0) {
            const { blob: seededBlob } = await buildBackupBlob(() => {});
            await bridgeUpload(seededBlob);
            setBridgeLastSync();
            return;
          }
          await store.replaceAll(data.problems, data.methods, () => {});
          applyBackupSettings(data.settings);
          const { blob: merged } = await buildBackupBlob(() => {});
          await bridgeUpload(merged);
          setBridgeLastSync();
          return;
        }
        // 冲突消解：本地数据比桥新 → 上传；桥比本地新 → 仅提示（电脑静默）
        const localT = localStateTime(store.problems, store.methods);
        const bridgeT = info.modified ?? 0;
        if (localT > bridgeT) {
          const { blob } = await buildBackupBlob(() => {});
          await bridgeUpload(blob);
          setBridgeLastSync();
        } else if (bridgeT > getBridgeLastSync() && !IS_DESKTOP_HOST) {
          setBridgeUpdate(true);
        }
      } catch {
        // 本地服务不可用时静默跳过
      } finally {
        bridgeBusyRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.ready]);

  // 编辑后 30 秒防抖：本地自动备份 + 局域网设备同步（页面隐藏时暂停，减少无谓开销）
  useEffect(() => {
    if (!store.ready) return;
    const timer = setTimeout(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      await maybeLocalBackup(store.problems, store.methods);
      // 局域网设备同步：并发/失败冷却守卫
      if (bridgeBusyRef.current) return;
      if (Date.now() < bridgeCooldownRef.current) return;
      bridgeBusyRef.current = true;
      try {
        const binfo = await bridgeInfo();
        if (binfo.exists) {
          // 刚播种且从未完成首次同步的设备：禁止上传种子数据覆盖桥
          if (store.seeded && getBridgeLastSync() === 0) return;
          const localT = localStateTime(store.problems, store.methods);
          const bridgeT = binfo.modified ?? 0;
          if (localT > bridgeT) {
            const { blob } = await buildBackupBlob(() => {});
            await bridgeUpload(blob);
            setBridgeLastSync();
          } else if (bridgeT > getBridgeLastSync() && !IS_DESKTOP_HOST) {
            setBridgeUpdate(true);
          }
        } else if (store.problems.length > 0 && !store.seeded) {
          const { blob } = await buildBackupBlob(() => {});
          await bridgeUpload(blob);
          setBridgeLastSync();
        }
      } catch {
        // 桥接不可用：5 分钟冷却，避免每 30 秒空转打网络
        bridgeCooldownRef.current = Date.now() + 5 * 60_000;
      } finally {
        bridgeBusyRef.current = false;
      }
    }, 30000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.problems, store.methods, store.ready, maybeLocalBackup]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") delete root.dataset.theme;
    else root.dataset.theme = theme;
    localStorage.setItem("mb-theme", theme);
  }, [theme]);

  // 聚光玻璃：把鼠标位置写入 CSS 变量，供玻璃控件的高光跟随光标
  useEffect(() => {
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
        document.documentElement.style.setProperty("--my", `${e.clientY}px`);
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme((t) => THEME_CYCLE[(THEME_CYCLE.indexOf(t) + 1) % THEME_CYCLE.length]);
  }, []);

  /* ---------- 演示模式（F9）---------- */
  const demoApi = () => (window as unknown as { __demoApi?: Record<string, (id?: string) => void> }).__demoApi;

  const stopDemo = useCallback(() => {
    demoRunRef.current++;
    demoRef.current = false;
    setDemo(false);
    setSelectedId(null);
  }, []);

  const runDemo = useCallback(async () => {
    demoRunRef.current++;
    const token = demoRunRef.current;
    demoRef.current = true;
    setDemo(true);
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const alive = () => demoRef.current && demoRunRef.current === token;
    try {
      setView("library");
      await sleep(4200);
      if (!alive()) return;
      const p0 = store.problems[0];
      if (p0) setSelectedId(p0.id);
      await sleep(4600);
      if (!alive()) return;
      setSelectedId(null);
      await sleep(1400);
      if (!alive()) return;
      setView("network");
      await sleep(7600);
      if (!alive()) return;
      const deg = (id: string) =>
        store.problems.reduce(
          (n, p) => n + (p.methodLinks?.filter((l) => l.methodId === id).length ?? 0),
          0
        );
      const top = [...store.methods].sort((a, b) => deg(b.id) - deg(a.id))[0];
      if (top) demoApi()?.networkDive?.(top.id);
      await sleep(7800);
      if (!alive()) return;
      demoApi()?.networkExit?.();
      await sleep(2000);
      if (!alive()) return;
      setView("review");
      await sleep(1700);
      if (!alive()) return;
      demoApi()?.reviewShowMethods?.();
      await sleep(3200);
      if (!alive()) return;
      demoApi()?.reviewReveal?.();
      await sleep(3600);
      if (!alive()) return;
      setView("report");
      await sleep(6200);
      if (!alive()) return;
      setView("library");
      await sleep(1600);
    } finally {
      if (demoRunRef.current === token) {
        demoRef.current = false;
        setDemo(false);
      }
    }
  }, [store.problems, store.methods]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        if (demoRef.current) stopDemo();
        else void runDemo();
      }
      if (e.key === "Escape" && demoRef.current) {
        stopDemo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [runDemo, stopDemo]);

  const selected = store.problems.find((p) => p.id === selectedId) ?? null;
  const methodDetail = store.methods.find((m) => m.id === methodDetailId) ?? null;
  const tagNames = store.allTags.map((t) => t.name);
  const reviewDueProblems = store.problems.filter(
    (p) => p.status === "stuck" && (p.review?.nextReviewAt ?? 0) <= Date.now()
  ).length;
  const reviewDueMethods = store.methods.filter(
    (m) =>
      methodNeedsReview(m.mastery?.level) &&
      (m.review?.nextReviewAt ?? 0) <= Date.now()
  ).length;
  const reviewDueCount = reviewDueProblems + reviewDueMethods;
  const hardReviewDue = store.problems.filter(
    (p) => p.difficulty >= 4 && (p.hardReview?.nextReviewAt ?? 0) <= Date.now()
  ).length;
  const currentPort = window.location.port || (window.location.protocol === "https:" ? "443" : "80");
  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const showPortWarn = isLocalHost && currentPort !== "5173" && !portWarnDismissed;

  const handleSaveProblem = async (draft: ProblemDraft) => {
    if (form.initial) {
      const patch = { ...draft } as Partial<ProblemDraft>;
      if (draft.status === "stuck" && form.initial.status !== "stuck" && !form.initial.review) {
        patch.review = freshReview(Date.now(), draft.difficulty);
      }
      await store.updateProblem(form.initial.id, patch);
    } else {
      if (draft.status === "stuck") draft.review = freshReview(Date.now(), draft.difficulty);
      await store.addProblem(draft);
    }
  };

  const handleSaveMethod = async (draft: Omit<Method, "id" | "createdAt" | "updatedAt">) => {
    if (methodForm.initial) await store.updateMethod(methodForm.initial.id, draft);
    else await store.addMethod(draft);
  };

  const openLightbox = useCallback((src: string, caption: string, downloadName?: string) => {
    setLightbox({ src, caption, downloadName });
  }, []);

  const handleExportBackup = useCallback(
    async (onProgress: (done: number, total: number, label: string) => void) => {
      const { blob, problems, methods } = await buildBackupBlob(onProgress);
      downloadBlob(blob, `难题库备份-${new Date().toISOString().slice(0, 10)}.zip`);
      localStorage.setItem("mb-last-backup", String(Date.now()));
      setBackupReminder(null);
      return `已导出 ${problems} 道题、${methods} 个方法，包含全部图片原图（ZIP）。`;
    },
    []
  );

  const handleParseBackup = useCallback(
    async (
      file: File,
      onProgress: (done: number, total: number, label: string) => void
    ): Promise<BackupPreview> => {
      const data = await backupFileToData(file, onProgress);
      const { problems, methods } = data;
      const problemIds = new Set(store.problems.map((p) => p.id));
      const methodIds = new Set(store.methods.map((m) => m.id));
      return {
        problems,
        methods,
        overlapProblems: problems.filter((p) => problemIds.has(p.id)).length,
        overlapMethods: methods.filter((m) => methodIds.has(m.id)).length,
        totalImages:
          problems.reduce((n, p) => n + p.images.length, 0) +
          methods.reduce((n, m) => n + m.images.length, 0),
        settings: data.settings,
      };
    },
    [store]
  );

  const handleImportBackup = useCallback(
    async (
      problems: Problem[],
      methods: Method[],
      onProgress: (done: number, total: number, label: string) => void,
      replace = false,
      settings?: BackupSettings
    ) => {
      const res = replace
        ? await store.replaceAll(problems, methods, onProgress)
        : await store.importBackup(problems, methods, onProgress);
      // 导入/替换后立即把最新题库推送到局域网数据桥，防止旧数据被重新合并回来
      try {
        const { blob } = await buildBackupBlob(() => {});
        await bridgeUpload(blob);
        setBridgeLastSync();
        setBridgeUpdate(false);
      } catch {
        // 推送失败不阻塞导入
      }
      applyBackupSettings(settings);
      return replace
        ? `替换完成：已删除原有数据，导入 ${res.problems} 道题、${res.methods} 个方法。`
        : `导入完成：${res.problems} 道题、${res.methods} 个方法（按 ID 合并覆盖）。`;
    },
    [store]
  );

  const handleExportImages = useCallback(async (p: Problem) => {
    try {
      const result = await exportProblemImages(p);
      if (result === "downloaded") {
        window.alert("当前浏览器不支持一键导出到文件夹，已改为逐张下载原图。");
      }
    } catch (e) {
      window.alert(`导出图片失败：${(e as Error).message}`);
    }
  }, []);

  const handleClearAll = useCallback(async () => {
    await store.clearAll();
    // 清空后同步到局域网数据桥，避免其他设备把旧数据合并回来
    try {
      const { blob } = await buildBackupBlob(() => {});
      await bridgeUpload(blob);
      setBridgeLastSync();
      setBridgeUpdate(false);
    } catch {
      // 推送失败不阻塞清空
    }
    return "已清空全部题目与方法。";
  }, [store]);

  const handleQuickCreateMethod = useCallback(
    async (name: string, signal: string) =>
      store.addMethod({
        name,
        signal,
        description: "",
        tags: [],
        steps: [],
        pitfalls: "",
        images: [],
      }),
    [store]
  );

  const handleStatusChange = useCallback(
    (id: string, status: ProblemStatus) => {
      const p = store.problems.find((x) => x.id === id);
      const patch: Partial<ProblemDraft> = { status };
      if (status === "stuck" && p && p.status !== "stuck" && !p.review) {
        patch.review = freshReview(Date.now(), p.difficulty);
      }
      void store.updateProblem(id, patch);
    },
    [store]
  );

  return (
    <MotionConfig reducedMotion="user">
      <ParticleBackground />
      <div className="cursor-light" aria-hidden="true" />
      <div className="app">
      {demo && (
        <div className="demo-chip" aria-live="polite">
          <i className="demo-chip-dot" />
          演示模式 · 正在自动运镜
          <span className="demo-chip-key">Esc 退出</span>
        </div>
      )}
      <Sidebar
        view={view}
        onView={setView}
        counts={{
          problems: store.problems.length,
          review: reviewDueCount,
          hardReview: hardReviewDue,
          clever: store.problems.reduce(
            (n, p) =>
              n +
              (p.solutions ?? []).reduce(
                (m, s) => m + s.steps.filter((x) => x.starred).length,
                0
              ),
            0
          ),
          methods: store.methods.length,
          tags: store.allTags.length,
        }}
        onAdd={() => setForm({ open: true, initial: null })}
        onBackup={() => setBackupOpen(true)}
        onQr={() => setQrOpen(true)}
        theme={theme}
        onCycleTheme={cycleTheme}
      />

      <MobileTabBar
        view={view}
        onView={setView}
        counts={{
          problems: store.problems.length,
          review: reviewDueCount,
          hardReview: hardReviewDue,
          clever: store.problems.reduce(
            (n, p) =>
              n +
              (p.solutions ?? []).reduce(
                (m, s) => m + s.steps.filter((x) => x.starred).length,
                0
              ),
            0
          ),
          methods: store.methods.length,
          tags: store.allTags.length,
        }}
        onAdd={() => setForm({ open: true, initial: null })}
        onBackup={() => setBackupOpen(true)}
      />

      <main className="main">
        {backupReminder !== null && (
          <div className="backup-reminder" role="status">
            <span>
              已 {backupReminder} 天没有备份了，建议导出一次完整备份（含全部图片）。
            </span>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setBackupOpen(true);
              }}
            >
              去备份
            </button>
            <button
              className="icon-btn"
              aria-label="关闭备份提醒"
              onClick={() => {
                setBackupReminder(null);
                sessionStorage.setItem("mb-backup-reminder-dismissed", "1");
              }}
            >
              <span aria-hidden>×</span>
            </button>
          </div>
        )}
        {!store.ready ? (
          store.loadError ? (
            <div className="empty load-error">
              <h3>打开题库失败</h3>
              <p>{store.loadError}</p>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>
                重试
              </button>
            </div>
          ) : (
            <>
              <div className="page-head">
                <div>
                  <h1 className="page-title">题库</h1>
                  <p className="page-sub">正在打开你的本地题库…</p>
                </div>
                <Skeleton className="btn-skel" style={{ width: 120, height: 38 }} />
              </div>
              <CardGridSkeleton />
            </>
          )
        ) : (
          <ViewFade viewKey={view}>
            {showPortWarn && (
              <div className="sync-reminder port-warning" role="status">
                <Cloud size={17} />
                <span>
                  当前端口 {currentPort} 与常用数据端口 5173 不同，这里的数据可能不一致。
                </span>
                <button
                  className="btn btn-ghost"
                  onClick={() => window.open("http://localhost:5173/", "_blank")}
                >
                  打开 5173
                </button>
                <button
                  className="icon-btn"
                  aria-label="关闭端口提醒"
                  onClick={() => setPortWarnDismissed(true)}
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            )}
            {bridgeUpdate && !IS_DESKTOP_HOST && (
              <div className="sync-reminder bridge-update" role="status">
                <Cloud size={17} />
                <span>其他设备（手机/电脑）有更新的题库。</span>
                <button className="btn btn-ghost" onClick={() => setBackupOpen(true)}>
                  去合并
                </button>
                <button
                  className="icon-btn"
                  aria-label="关闭同步提醒"
                  onClick={() => setBridgeUpdate(false)}
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            )}
            {reviewDueCount > 0 && view !== "review" && (
              <div className="review-reminder" role="status">
                <Clock size={17} />
                <span>
                  有 {reviewDueProblems} 道题
                  {reviewDueMethods > 0 ? `、${reviewDueMethods} 个方法` : ""}
                  {hardReviewDue > 0 ? `、${hardReviewDue} 道难题` : ""}
                  该回看了。
                </span>
                <button className="btn btn-ghost" onClick={() => setView("review")}>
                  去回看
                </button>
              </div>
            )}
            {view === "library" ? (
              <Library
                problems={store.problems}
                allTags={store.allTags}
                onOpen={setSelectedId}
                onAdd={() => setForm({ open: true, initial: null })}
              />
            ) : view === "clever" ? (
              <CleverLibrary
                problems={store.problems}
                onOpenProblem={setSelectedId}
                onUpdateProblem={(id, patch) => void store.updateProblem(id, patch)}
              />
            ) : view === "review" ? (
              <ReviewLibrary
                problems={store.problems}
                methods={store.methods}
                onOpenProblem={setSelectedId}
                onOpenMethod={(id) => setMethodDetailId(id)}
                onOpenImage={(src, caption) => openLightbox(src, caption)}
                onUpdateProblem={(id, patch) => void store.updateProblem(id, patch)}
                onUpdateMethod={(id, patch) => void store.updateMethod(id, patch)}
              />
            ) : view === "hardReview" ? (
              <HardReviewLibrary
                problems={store.problems}
                onOpenProblem={setSelectedId}
                onOpenImage={(src, caption) => openLightbox(src, caption)}
                onUpdateProblem={(id, patch) => void store.updateProblem(id, patch)}
              />
            ) : view === "network" ? (
              <Suspense
                fallback={
                  <div className="network-loading" style={{ flexDirection: "column" }}>
                    <Skeleton
                      className="network-skel"
                      style={{ width: 260, height: 200, borderRadius: 20 }}
                    />
                    <span>正在启动招式引擎…</span>
                  </div>
                }
              >
                <NetworkView
                  problems={store.problems}
                  methods={store.methods}
                  onOpenProblem={setSelectedId}
                  onOpenMethod={(id) => setMethodDetailId(id)}
                />
              </Suspense>
            ) : view === "report" ? (
              <ReportPage problems={store.problems} methods={store.methods} />
            ) : view === "methods" ? (
              <MethodLibrary
                methods={store.methods}
                problems={store.problems}
                onOpen={(m) => setMethodDetailId(m.id)}
                onEdit={(m) => setMethodForm({ open: true, initial: m })}
                onAdd={() => setMethodForm({ open: true, initial: null })}
              />
            ) : (
              <TagsPage tags={store.allTags} onRename={store.renameTag} onDelete={store.deleteTag} />
            )}
          </ViewFade>
        )}
      </main>

      <ProblemDetailSheet
        open={!!selected}
        problem={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(p) => {
          setSelectedId(null);
          setForm({ open: true, initial: p });
        }}
        onDelete={(id) => void store.deleteProblem(id)}
        onStatusChange={handleStatusChange}
        onLightbox={openLightbox}
        onOpenMethod={(id) => {
          setSelectedId(null);
          setMethodDetailId(id);
        }}
        onExportImages={handleExportImages}
        methods={store.methods}
      />

      <ProblemFormSheet
        open={form.open}
        initial={form.initial}
        tags={tagNames}
        methods={store.methods}
        onQuickCreateMethod={handleQuickCreateMethod}
        onClose={() => setForm({ open: false, initial: null })}
        onSave={handleSaveProblem}
      />

      <MethodDetailSheet
        open={!!methodDetail}
        method={methodDetail}
        problems={store.problems}
        onClose={() => setMethodDetailId(null)}
        onEdit={(m) => {
          setMethodDetailId(null);
          setMethodForm({ open: true, initial: m });
        }}
        onDelete={(id) => void store.deleteMethod(id)}
        onOpenProblem={(id) => {
          setMethodDetailId(null);
          setSelectedId(id);
        }}
        onUpdateProblem={(id, patch) => void store.updateProblem(id, patch)}
        onLightbox={openLightbox}
      />

      <MethodFormSheet
        open={methodForm.open}
        initial={methodForm.initial}
        tags={tagNames}
        onClose={() => setMethodForm({ open: false, initial: null })}
        onSave={handleSaveMethod}
      />

      <BackupSheet
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        problems={store.problems}
        methods={store.methods}
        onExport={handleExportBackup}
        onParse={handleParseBackup}
        onImport={handleImportBackup}
        onClearAll={handleClearAll}
      />

      <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} />

      <AnimatePresence>
        {lightbox && (
          <Lightbox
            src={lightbox.src}
            caption={lightbox.caption}
            downloadName={lightbox.downloadName}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
