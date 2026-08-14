import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Method, Problem } from "../types";
import { MASTERY_LABEL } from "../types";
import { formatDate } from "../utils/format";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { Empty } from "./ui/Empty";
import { Bulb, Pencil, Plus, Search } from "./ui/icons";

interface MethodLibraryProps {
  methods: Method[];
  problems: Problem[];
  onOpen: (m: Method) => void;
  onEdit: (m: Method) => void;
  onAdd: () => void;
}

const PAGE_SIZE = 24;

function MiniThumb({ problem }: { problem: Problem }) {
  const img = problem.images.find((i) => i.kind === "problem") ?? problem.images[0];
  const url = useBlobUrl(img?.blob);
  return url ? <img src={url} alt={problem.title} /> : null;
}

function CardThumb({ blob }: { blob: Blob }) {
  const url = useBlobUrl(blob);
  return url ? <img src={url} alt="" /> : null;
}

function MethodCard({
  method,
  related,
  relatedProblems,
  onOpen,
  onEdit,
}: {
  method: Method;
  related: number;
  relatedProblems: Problem[];
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    <motion.div
      layout
      className="card method-card"
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: "spring", bounce: 0.18, duration: 0.45 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {method.images.length > 0 && (
        <div className="method-thumb">
          <CardThumb blob={method.images[0].blob} />
        </div>
      )}
      <div className="method-card-head">
        <div className="method-name">{method.name}</div>
        {method.mastery && (
          <span className={`badge mastery lv${method.mastery.level}`}>
            {MASTERY_LABEL[method.mastery.level]}
          </span>
        )}
        <motion.button
          className="icon-btn method-edit-btn"
          aria-label={`编辑 ${method.name}`}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil size={14} />
        </motion.button>
      </div>
      {method.signal && (
        <div className="signal method-signal">
          <b>什么时候想到它</b>
          {method.signal}
        </div>
      )}
      <div className="method-desc">{method.description}</div>
      {method.tags.length > 0 && (
        <div className="card-tags">
          {method.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}
      {relatedProblems.length > 0 && (
        <div className="thumb-row" aria-label={`关联题目 ${related} 道`}>
          {relatedProblems.slice(0, 4).map((p) => (
            <span key={p.id} className="mini-thumb" title={p.title}>
              <MiniThumb problem={p} />
            </span>
          ))}
          {related > 4 && <span className="thumb-more">+{related - 4}</span>}
        </div>
      )}
      <div className="card-foot">
        <span>
          关联 {related} 题 · 步骤 {method.steps.length} 步
        </span>
        <span className="muted">{formatDate(method.updatedAt)}</span>
      </div>
    </motion.div>
  );
}

export function MethodLibrary({ methods, problems, onOpen, onEdit, onAdd }: MethodLibraryProps) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query]);

  const relatedMap = useMemo(() => {
    const map = new Map<string, Problem[]>();
    for (const m of methods) map.set(m.id, []);
    for (const p of problems) {
      for (const l of p.methodLinks ?? []) {
        const list = map.get(l.methodId);
        if (list) list.push(p);
      }
    }
    return map;
  }, [methods, problems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return methods;
    return methods.filter((m) =>
      [m.name, m.signal, m.description, ...m.tags, ...(m.steps ?? []), m.pitfalls ?? "", ...(m.images ?? []).map((i) => i.caption)]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [methods, query]);

  const shown = filtered.slice(0, visible);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">方法库</h1>
          <p className="page-sub">
            把具体题目的解法抽象成可复用方法；点卡片查看完整说明与关联题目。
          </p>
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          <Plus size={16} />
          新建方法
        </button>
      </div>

      <div className="search method-search" style={{ maxWidth: 440, marginBottom: 18 }}>
        <span className="search-icon">
          <Search size={16} />
        </span>
        <input
          className="input"
          placeholder="搜索方法：名称、适用信号、标签…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {methods.length === 0 ? (
        <Empty
          icon={<Bulb size={28} />}
          title="方法库还是空的"
          description="做过几道同类型的题后，把共通的套路沉淀成一条方法。"
          action={
            <button className="btn btn-primary" onClick={onAdd}>
              <Plus size={16} />
              新建第一条方法
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <Empty
          icon={<Bulb size={28} />}
          title={`没有找到「${query.trim()}」`}
          description="试试搜名称、适用信号或标签里的关键词。"
          action={
            <button className="btn btn-ghost" onClick={() => setQuery("")}>
              清除搜索
            </button>
          }
        />
      ) : (
        <>
          <div className="grid">
            <AnimatePresence mode="popLayout">
              {shown.map((m) => (
                <MethodCard
                  key={m.id}
                  method={m}
                  related={relatedMap.get(m.id)?.length ?? 0}
                  relatedProblems={relatedMap.get(m.id) ?? []}
                  onOpen={() => onOpen(m)}
                  onEdit={() => onEdit(m)}
                />
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
