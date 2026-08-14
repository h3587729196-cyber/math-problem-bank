import { useMemo, useState } from "react";
import type { Problem, ProblemStatus } from "../types";
import { CLEVERNESS_LABEL, STATUS_LABEL } from "../types";
import { formatDate } from "../utils/format";
import { Empty } from "./ui/Empty";
import { DifficultyDots } from "./ui/Difficulty";
import { Bulb, Star } from "./ui/icons";

interface ThoughtSearchProps {
  problems: Problem[];
  query: string;
  status: "all" | ProblemStatus;
  difficulty: "all" | "1" | "2" | "3" | "4" | "5";
  tag: string;
  solutions: "all" | "none" | "1" | "2" | "3plus";
  onOpen: (id: string) => void;
}

interface ThoughtItem {
  key: string;
  stepId: string;
  text: string;
  solutionLabel: string;
  starred: boolean;
  cleverness: number;
  problemId: string;
  problemTitle: string;
  status: ProblemStatus;
  difficulty: number;
  updatedAt: number;
}

interface ThoughtGroup {
  tag: string;
  items: ThoughtItem[];
}

const GROUP_LIMIT = 20;
const UNTAGGED = "未分类";

export function ThoughtSearch({
  problems,
  query,
  status,
  difficulty,
  tag,
  solutions,
  onOpen,
}: ThoughtSearchProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, ThoughtItem[]>();
    const seen = new Set<string>();

    for (const p of problems) {
      if (status !== "all" && p.status !== status) continue;
      if (difficulty !== "all" && p.difficulty !== Number(difficulty)) continue;
      if (tag !== "all" && !p.tags.includes(tag)) continue;
      const solCount = (p.solutions ?? []).length;
      if (solutions === "none" && solCount > 0) continue;
      if (solutions === "1" && solCount !== 1) continue;
      if (solutions === "2" && solCount !== 2) continue;
      if (solutions === "3plus" && solCount < 3) continue;
      for (const sol of p.solutions ?? []) {
        for (const s of sol.steps) {
          const text = s.text.trim();
          if (!text) continue;
          if (q && !text.toLowerCase().includes(q)) continue;
          const key = `${p.id}:${s.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const item: ThoughtItem = {
            key,
            stepId: s.id,
            text,
            solutionLabel: sol.label,
            starred: s.starred,
            cleverness: s.cleverness,
            problemId: p.id,
            problemTitle: p.title,
            status: p.status,
            difficulty: p.difficulty,
            updatedAt: p.updatedAt,
          };
          const tags = p.tags.length > 0 ? p.tags : [UNTAGGED];
          for (const t of tags) {
            const list = map.get(t) ?? [];
            if (!list.some((x) => x.key === key)) list.push(item);
            map.set(t, list);
          }
        }
      }
    }

    const groups: ThoughtGroup[] = [];
    for (const [t, items] of map) {
      groups.push({
        tag: t,
        items: items.sort((a, b) => b.updatedAt - a.updatedAt),
      });
    }
    groups.sort((a, b) => {
      if (a.tag === UNTAGGED) return 1;
      if (b.tag === UNTAGGED) return -1;
      return a.tag.localeCompare(b.tag, "zh-Hans-CN");
    });
    return groups;
  }, [problems, query, status, difficulty, tag, solutions]);

  const totalItems = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <div className="thought-pool-head">
        <p className="page-sub">
          只搜索“破题思路”里的文字，与标题、来源、标签搜索分开；
          结果按题目的标签分类，同一思路带多个标签时会出现在多个分组里。
        </p>
        <p className="muted">
          匹配 {totalItems} 条思路，分布在 {groups.length} 个标签分组
        </p>
      </div>

      {groups.length === 0 ? (
        <Empty
          icon={<Bulb size={28} />}
          title={query ? "没有匹配的破题思路" : "还没有可展示的破题思路"}
          description={
            query
              ? "换个关键词试试，破题思路搜索只匹配思路步骤里的文字"
              : "在题目详情或编辑时给破题步骤填上文字，就会出现在这里"
          }
        />
      ) : (
        <div className="thought-groups">
          {groups.map((g) => {
            const showAll = expanded[g.tag] || g.items.length <= GROUP_LIMIT;
            const shown = showAll ? g.items : g.items.slice(0, GROUP_LIMIT);
            return (
              <section key={g.tag} className="thought-group">
                <header className="thought-group-head">
                  <span className="chip accent">{g.tag}</span>
                  <span className="muted">{g.items.length} 条</span>
                </header>
                <div className="thought-group-list">
                  {shown.map((item) => (
                    <div
                      key={item.key}
                      className="thought-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpen(item.problemId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(item.problemId);
                        }
                      }}
                    >
                      <div className="thought-item-text">
                        {item.text}
                        {item.starred && (
                          <span className="cleverness-badge">
                            <Star size={11} />
                            {CLEVERNESS_LABEL[item.cleverness]}
                          </span>
                        )}
                      </div>
                      <div className="thought-item-meta">
                        <span className="badge thought-status">{STATUS_LABEL[item.status]}</span>
                        <DifficultyDots value={item.difficulty} />
                        <span className="thought-solution">{item.solutionLabel}</span>
                        <span className="thought-source">来自：{item.problemTitle}</span>
                        <span className="muted">{formatDate(item.updatedAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {g.items.length > GROUP_LIMIT && (
                  <button
                    className="btn btn-ghost thought-group-more"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [g.tag]: !prev[g.tag] }))
                    }
                  >
                    {showAll ? "收起" : `展开全部 ${g.items.length} 条`}
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
