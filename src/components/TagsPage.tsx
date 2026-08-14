import { useState } from "react";
import type { TagStat } from "../types";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Empty } from "./ui/Empty";
import { Check, Pencil, Tag, Trash, X } from "./ui/icons";

interface TagsPageProps {
  tags: TagStat[];
  onRename: (oldName: string, newName: string) => Promise<void>;
  onDelete: (tag: string) => Promise<void>;
}

export function TagsPage({ tags, onRename, onDelete }: TagsPageProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{ oldName: string; newName: string } | null>(
    null
  );

  const commitRename = async (oldName: string) => {
    const name = draft.trim();
    if (!name || name === oldName) {
      setEditing(null);
      setDraft("");
      return;
    }
    const exists = tags.some((t) => t.name === name);
    if (exists) {
      setPendingMerge({ oldName, newName: name });
      return;
    }
    await onRename(oldName, name);
    setEditing(null);
    setDraft("");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">标签</h1>
          <p className="page-sub">统一管理题目与方法共用的标签，支持重命名与删除。</p>
        </div>
      </div>

      {tags.length === 0 ? (
        <Empty
          icon={<Tag size={28} />}
          title="还没有标签"
          description="在新增题目或方法时，随手打上知识点标签。"
        />
      ) : (
        <div className="tag-table">
          {tags.map((t) => (
            <div key={t.name} className="tag-row">
              {editing === t.name ? (
                <>
                  <input
                    className="input"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(t.name);
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                  <button
                    className="icon-btn"
                    aria-label="确认重命名"
                    onClick={() => void commitRename(t.name)}
                  >
                    <Check size={16} />
                  </button>
                  <button className="icon-btn" aria-label="取消" onClick={() => setEditing(null)}>
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span className="name">{t.name}</span>
                  <span className="stats">
                    {t.problemCount} 题 · {t.methodCount} 方法
                  </span>
                  <button
                    className="icon-btn"
                    aria-label={`重命名 ${t.name}`}
                    onClick={() => {
                      setEditing(t.name);
                      setDraft(t.name);
                    }}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`删除 ${t.name}`}
                    onClick={() => setDeleting(t.name)}
                  >
                    <Trash size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={`删除标签「${deleting ?? ""}」？`}
        message="会从所有题目和方法中移除该标签，题目本身不会被删除。"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void onDelete(deleting);
          setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={!!pendingMerge}
        title="标签已存在，将合并"
        message={
          pendingMerge
            ? `“${pendingMerge.oldName}”会合并到已存在的“${pendingMerge.newName}”，所有题目和方法中的这两个标签会变成同一个。`
            : ""
        }
        confirmLabel="合并并重命名"
        onCancel={() => setPendingMerge(null)}
        onConfirm={() => {
          if (pendingMerge) void onRename(pendingMerge.oldName, pendingMerge.newName);
          setPendingMerge(null);
          setEditing(null);
          setDraft("");
        }}
      />
    </>
  );
}
