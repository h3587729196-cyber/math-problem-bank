import { motion } from "motion/react";
import {
  Archive,
  Book,
  Bulb,
  ChartBar,
  Clock,
  Monitor,
  Moon,
  Plus,
  QrCode,
  Network,
  Sparkle,
  Star,
  Sun,
  Tag,
} from "./ui/icons";

export type View =
  | "library"
  | "review"
  | "hardReview"
  | "network"
  | "report"
  | "clever"
  | "methods"
  | "tags";
export type Theme = "system" | "light" | "dark";

interface SidebarProps {
  view: View;
  onView: (v: View) => void;
  counts: {
    problems: number;
    review: number;
    hardReview: number;
    clever: number;
    methods: number;
    tags: number;
  };
  onAdd: () => void;
  onBackup: () => void;
  onQr: () => void;
  theme: Theme;
  onCycleTheme: () => void;
}

const THEME_ICON: Record<Theme, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };
const THEME_LABEL: Record<Theme, string> = { system: "跟随系统", light: "浅色", dark: "深色" };

export function Sidebar({
  view,
  onView,
  counts,
  onAdd,
  onBackup,
  onQr,
  theme,
  onCycleTheme,
}: SidebarProps) {
  const ThemeIcon = THEME_ICON[theme];
  const items = [
    { id: "library" as const, label: "题库", icon: Book, count: counts.problems },
    { id: "review" as const, label: "回看", icon: Clock, count: counts.review },
    { id: "hardReview" as const, label: "认知回看", icon: Sparkle, count: counts.hardReview },
    { id: "network" as const, label: "招式网络", icon: Network, count: undefined as number | undefined },
    { id: "report" as const, label: "数据分析", icon: ChartBar, count: undefined as number | undefined },
    { id: "clever" as const, label: "巧思库", icon: Star, count: counts.clever },
    { id: "methods" as const, label: "方法库", icon: Bulb, count: counts.methods },
    { id: "tags" as const, label: "标签", icon: Tag, count: counts.tags },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M4 5.5 12 3l8 2.5v12L12 20l-8-2.5v-12Z" />
            <path d="M4 5.5 12 8m0-5v12M12 8l8-2.5" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">难题库</div>
          <div className="brand-tag">数学解题思路</div>
        </div>
      </div>

      <nav className="nav" aria-label="主导航">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <motion.button
              key={item.id}
              className={`nav-item ${active ? "active" : ""}`}
              whileTap={{ scale: 0.97 }}
              onClick={() => onView(item.id)}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <motion.span
                  className="nav-pill"
                  layoutId="sidebar-pill"
                  transition={{ type: "spring", bounce: 0.22, duration: 0.55 }}
                />
              )}
              <Icon size={19} />
              <span className="nav-label">{item.label}</span>
              {item.count !== undefined && <span className="count">{item.count}</span>}
            </motion.button>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <button className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} />
          <span className="nav-label">新增题目</span>
        </button>
        <button className="btn btn-ghost" onClick={onBackup}>
          <Archive size={16} />
          <span className="nav-label">备份与恢复</span>
        </button>
        <button className="btn btn-ghost" onClick={onQr}>
          <QrCode size={16} />
          <span className="nav-label">手机访问</span>
        </button>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <motion.button
            className="icon-btn"
            whileTap={{ scale: 0.9 }}
            onClick={onCycleTheme}
            title={`主题：${THEME_LABEL[theme]}（点击切换）`}
            aria-label={`主题：${THEME_LABEL[theme]}，点击切换`}
          >
            <ThemeIcon size={18} />
          </motion.button>
          <span className="storage-note">图片仅保存在本机浏览器</span>
        </div>
      </div>
    </aside>
  );
}
