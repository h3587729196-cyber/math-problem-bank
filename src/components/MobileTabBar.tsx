import { motion } from "motion/react";
import {
  Archive,
  Book,
  Bulb,
  ChartBar,
  Clock,
  Network,
  Plus,
  Sparkle,
  Star,
  Tag,
} from "./ui/icons";
import type { View } from "./Sidebar";

interface MobileTabBarProps {
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
}

const items = [
  { id: "library" as const, label: "题库", icon: Book },
  { id: "review" as const, label: "回看", icon: Clock },
  { id: "hardReview" as const, label: "认知", icon: Sparkle },
  { id: "network" as const, label: "网络", icon: Network },
  { id: "report" as const, label: "分析", icon: ChartBar },
  { id: "clever" as const, label: "巧思", icon: Star },
  { id: "methods" as const, label: "方法", icon: Bulb },
  { id: "tags" as const, label: "标签", icon: Tag },
];

export function MobileTabBar({ view, onView, counts, onAdd, onBackup }: MobileTabBarProps) {
  return (
    <>
      <nav className="mobile-tabbar" aria-label="主导航">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              className={`mobile-tab ${active ? "active" : ""}`}
              onClick={() => onView(item.id)}
              aria-current={active ? "page" : undefined}
            >
              <span className="mobile-tab-icon">
                {active && (
                  <motion.span
                    layoutId="mobile-tab-pill"
                    className="mobile-tab-pill"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.45 }}
                  />
                )}
                <Icon size={19} />
                {item.id === "review" && counts.review > 0 && (
                  <i className="mobile-tab-dot" />
                )}
              </span>
              <span className="mobile-tab-label">{item.label}</span>
            </button>
          );
        })}
        <button
          className="mobile-tab tab-backup"
          onClick={onBackup}
          aria-label="备份与恢复"
          title="备份与恢复"
        >
          <span className="mobile-tab-icon">
            <Archive size={19} />
          </span>
          <span className="mobile-tab-label">备份</span>
        </button>
      </nav>
      <button className="mobile-fab" onClick={onAdd} aria-label="新增题目" title="新增题目">
        <Plus size={22} />
      </button>
    </>
  );
}
