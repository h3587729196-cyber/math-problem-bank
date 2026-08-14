import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Problem, ProblemDraft, ThoughtStep } from "../types";
import { CLEVERNESS_LABEL } from "../types";
import { formatDate } from "../utils/format";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Empty } from "./ui/Empty";
import { Search, Star, Trash } from "./ui/icons";

interface CleverEntry {
  key: string;
  step: ThoughtStep;
  problem: Problem;
  solutionId: string;
  solutionLabel: string;
}

interface CleverLibraryProps {
  problems: Problem[];
  onOpenProblem: (id: string) => void;
  onUpdateProblem: (id: string, patch: Partial<ProblemDraft>) => void;
}

type Sort = "level-desc" | "level-asc" | "recent";

const PAGE_SIZE = 24;

export function CleverLibrary({ problems, onOpenProblem, onUpdateProblem }: CleverLibraryProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("level-desc");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [pendingDelete, setPendingDelete] = useState<{
    problemId: string;
    stepId: string;
    text: string;
  } | null>(null);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, sort]);

  const entries = useMemo(() => {
    const list: CleverEntry[] = [];
    for (const p of problems) {
      for (const sol of p.solutions ?? []) {
        for (const s of sol.steps) {
          if (s.starred && s.text.trim()) {
            list.push({
              key: `${p.id}:${s.id}`,
              step: s,
              problem: p,
              solutionId: sol.id,
              solutionLabel: sol.label,
            });
          }
        }
      }
    }
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter((e) =>
          [e.step.text, e.problem.title, ...e.problem.tags]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : list;
    return filtered.sort((a, b) => {
      if (sort === "recent") return b.problem.updatedAt - a.problem.updatedAt;
      if (sort === "level-asc") return a.step.cleverness - b.step.cleverness;
      return b.step.cleverness - a.step.cleverness;
    });
  }, [problems, query, sort]);

  const shown = entries.slice(0, visible);

  const updateSteps = (problem: Problem, solutionId: string, steps: ThoughtStep[]) =>
    onUpdateProblem(problem.id, {
      solutions: problem.solutions.map((s) =>
        s.id === solutionId ? { ...s, steps } : s
      ),
    });

  const setCleverness = (entry: CleverEntry, cleverness: ThoughtStep["cleverness"]) => {
    updateSteps(
      entry.problem,
      entry.solutionId,
      entry.problem.solutions.find((s) => s.id === entry.solutionId)?.steps.map((s) =>
        s.id === entry.step.id ? { ...s, cleverness } : s
      ) ?? []
    );
  };

  const unstar = (entry: CleverEntry) => {
    updateSteps(
      entry.problem,
      entry.solutionId,
      entry.problem.solutions.find((s) => s.id === entry.solutionId)?.steps.map((s) =>
        s.id === entry.step.id ? { ...s, starred: false } : s
      ) ?? []
    );
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const problem = problems.find((p) => p.id === pendingDelete.problemId);
    if (problem) {
      const sol = problem.solutions.find((s) =>
        s.steps.some((x) => x.id === pendingDelete.stepId)
      );
      if (!sol) return;
      updateSteps(
        problem,
        sol.id,
        sol.steps.filter((s) => s.id !== pendingDelete.stepId)
      );
    }
    setPendingDelete(null);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">巧思库</h1>
          <p className="page-sub">
            所有标星收藏的破题步骤自动汇集在这里；点击条目可溯源回原题目，
            也可以直接取消收藏、调整巧妙程度或删除。
          </p>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 18, gap: 10 }}>
        <div className="search clever-search grow" style={{ minWidth: 220 }}>
          <span className="search-icon">
            <Search size={16} />
          </span>
          <input
            className="input"
            placeholder="搜索巧思：步骤文字、原题、标签…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="select clever-sort"
          style={{ width: "auto" }}
          value={sort}
          aria-label="排序方式"
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="level-desc">绝妙优先</option>
          <option value="level-asc">程度从低到高</option>
          <option value="recent">最近更新</option>
        </select>
      </div>

      {entries.length === 0 ? (
        <Empty
          icon={<Star size={28} />}
          title={query ? "没有匹配的巧思" : "巧思库还是空的"}
          description={
            query
              ? "换个关键词试试。"
              : "编辑题目时给破题步骤点星标，精彩的想法会自动收藏到这里。"
          }
        />
      ) : (
        <>
          <div className="clever-grid">
            {shown.map((e) => (
              <motion.div
                key={e.key}
                layout
                className="clever-card"
                role="button"
                tabIndex={0}
                initial={{ opacity: 0, scale: 0.97, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpenProblem(e.problem.id)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    onOpenProblem(e.problem.id);
                  }
                }}
              >
                <div className="clever-head">
                  <span className={`clever-level lv${e.step.cleverness}`}>
                    <Star size={12} />
                    {CLEVERNESS_LABEL[e.step.cleverness]}
                  </span>
                  <div className="clever-actions" onClick={(ev) => ev.stopPropagation()}>
                    <select
                      className="clever-level-select"
                      value={e.step.cleverness}
                      aria-label="调整巧妙程度"
                      title="调整巧妙程度"
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(ev) =>
                        setCleverness(e, Number(ev.target.value) as ThoughtStep["cleverness"])
                      }
                    >
                      {([1, 2, 3, 4, 5] as const).map((n) => (
                        <option key={n} value={n}>
                          {n} · {CLEVERNESS_LABEL[n]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="icon-btn clever-action"
                      aria-label="取消收藏"
                      title="取消收藏"
                      onClick={() => unstar(e)}
                    >
                      <Star size={14} />
                    </button>
                    <button
                      className="icon-btn clever-action danger"
                      aria-label="删除这条巧思"
                      title="删除这条巧思"
                      onClick={() =>
                        setPendingDelete({
                          problemId: e.problem.id,
                          stepId: e.step.id,
                          text: e.step.text,
                        })
                      }
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
                <div className="clever-text">{e.step.text}</div>
                <div className="clever-source">
                  {e.solutionLabel} · 来源：{e.problem.title}
                </div>
                {e.problem.tags.length > 0 && (
                  <div className="card-tags">
                    {e.problem.tags.slice(0, 3).map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="clever-foot">
                  <span className="muted">{formatDate(e.problem.updatedAt)}</span>
                </div>
              </motion.div>
            ))}
          </div>
          {entries.length > visible && (
            <div className="load-more-wrap">
              <button className="btn btn-ghost" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                显示更多（还有 {entries.length - visible} 条）
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="删除这条巧思？"
        message={
          pendingDelete
            ? `“${pendingDelete.text}”会从原题目的破题步骤中一并删除，此操作无法撤销。`
            : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
