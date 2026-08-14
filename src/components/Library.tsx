import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Problem, ProblemStatus, TagStat } from "../types";
import { STATUS_LABEL } from "../types";
import { DIFFICULTY_LABEL, formatDate } from "../utils/format";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { ThoughtSearch } from "./ThoughtSearch";
import { Segmented } from "./ui/Segmented";
import { Empty } from "./ui/Empty";
import { DifficultyDots } from "./ui/Difficulty";
import { Book, ImageIcon, Plus, Search } from "./ui/icons";

type StatusFilter = "all" | ProblemStatus;
type Sort = "recent" | "hard" | "easy" | "title";
type SearchPool = "all" | "thought";
type SolutionsFilter = "all" | "none" | "1" | "2" | "3plus";

const PAGE_SIZE = 24;

interface LibraryProps {
  problems: Problem[];
  allTags: TagStat[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}

function ProblemCard({ problem, onOpen }: { problem: Problem; onOpen: () => void }) {
  const mainImage =
    problem.images.find((i) => i.kind === "problem") ?? problem.images[0];
  const url = useBlobUrl(mainImage?.blob);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      layout
      className="card"
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="card-thumb">
        {url ? <img src={url} alt={problem.title} /> : <ImageIcon size={30} />}
      </div>
      <div className="card-body">
        <div className="card-title">{problem.title || "未命名题目"}</div>
        <div className="card-tags">
          {problem.tags.slice(0, 3).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
        <div className="card-foot">
          <span className={`badge ${problem.status}`}>{STATUS_LABEL[problem.status]}</span>
          <span className="row">
            <DifficultyDots value={problem.difficulty} />
            <span className="muted">{formatDate(problem.updatedAt)}</span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}

export function Library({ problems, allTags, onOpen, onAdd }: LibraryProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [difficulty, setDifficulty] = useState<"all" | "1" | "2" | "3" | "4" | "5">("all");
  const [tag, setTag] = useState<string>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [pool, setPool] = useState<SearchPool>("all");
  const [solutions, setSolutions] = useState<SolutionsFilter>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, status, difficulty, tag, sort, pool, solutions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = problems.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (difficulty !== "all" && p.difficulty !== Number(difficulty)) return false;
      if (tag !== "all" && !p.tags.includes(tag)) return false;
      const solCount = (p.solutions ?? []).length;
      if (solutions === "none" && solCount > 0) return false;
      if (solutions === "1" && solCount !== 1) return false;
      if (solutions === "2" && solCount !== 2) return false;
      if (solutions === "3plus" && solCount < 3) return false;
      if (q) {
        const hay = [p.title, p.source, ...p.tags, ...p.images.map((i) => i.caption)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "recent") return b.updatedAt - a.updatedAt;
      if (sort === "hard") return b.difficulty - a.difficulty;
      if (sort === "easy") return a.difficulty - b.difficulty;
      return a.title.localeCompare(b.title, "zh-Hans-CN");
    });
    return list;
  }, [problems, query, status, difficulty, tag, sort, solutions]);

  const shown = filtered.slice(0, visible);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">题库</h1>
          <p className="page-sub">题目与解题思路全部以图片保存，只看过程，不刷统计。</p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} />
          新增题目
        </button>
      </div>

      <div className="filters">
        <div className="search grow" style={{ minWidth: 220 }}>
          <span className="search-icon">
            <Search size={16} />
          </span>
          <input
            className="input"
            placeholder="搜索标题、标签、来源…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Segmented
          id="status"
          value={status}
          options={[
            { value: "all", label: "全部" },
            { value: "todo", label: "待做" },
            { value: "solved", label: "已解" },
            { value: "stuck", label: "卡住" },
          ]}
          onChange={setStatus}
        />
        <Segmented
          id="pool"
          value={pool}
          options={[
            { value: "all", label: "常规搜索" },
            { value: "thought", label: "破题思路" },
          ]}
          onChange={setPool}
        />
        <select
          className="select"
          style={{ width: "auto" }}
          value={solutions}
          onChange={(e) => setSolutions(e.target.value as SolutionsFilter)}
          aria-label="按解法数筛选"
        >
          <option value="all">全部解法数</option>
          <option value="1">1 个解法</option>
          <option value="2">2 个解法</option>
          <option value="3plus">3 个解法及以上</option>
          <option value="none">暂无解法</option>
        </select>
        <select
          className="select"
          style={{ width: "auto" }}
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
          aria-label="按难度筛选"
        >
          <option value="all">全部难度</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {DIFFICULTY_LABEL[n]}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: "auto" }}
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          aria-label="按标签筛选"
        >
          <option value="all">全部标签</option>
          {allTags.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        {pool === "all" && (
          <select
            className="select"
            style={{ width: "auto" }}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="排序方式"
          >
            <option value="recent">最近更新</option>
            <option value="hard">难度从高到低</option>
            <option value="easy">难度从低到高</option>
            <option value="title">按标题</option>
          </select>
        )}
      </div>

      {pool === "thought" ? (
        <ThoughtSearch
          problems={problems}
          query={query}
          status={status}
          difficulty={difficulty}
          tag={tag}
          solutions={solutions}
          onOpen={onOpen}
        />
      ) : filtered.length === 0 ? (
        <Empty
          icon={<Book size={28} />}
          title={problems.length === 0 ? "题库还是空的" : "没有符合条件的题目"}
          description={
            problems.length === 0 ? "点击右上角「新增题目」，用图片记录第一道难题。" : "试试调整筛选条件或搜索词。"
          }
          action={
            problems.length === 0 ? (
              <button className="btn btn-primary" onClick={onAdd}>
                <Plus size={16} />
                新增第一道题
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid">
            <AnimatePresence mode="popLayout">
              {shown.map((p) => (
                <ProblemCard key={p.id} problem={p} onOpen={() => onOpen(p.id)} />
              ))}
            </AnimatePresence>
          </div>
          {filtered.length > visible && (
            <div className="load-more-wrap">
              <button
                className="btn btn-ghost"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
              >
                显示更多（还有 {filtered.length - visible} 条）
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
