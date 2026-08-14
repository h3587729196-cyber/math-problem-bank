import { useMemo, useState } from "react";
import type { Method, MethodRole, Problem, ProblemDraft } from "../types";
import { MASTERY_LABEL, ROLE_LABEL, ROLE_ORDER } from "../types";
import { formatDate } from "../utils/format";
import { uid } from "../utils/id";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { blobFileName } from "../db/backup";
import { Sheet } from "./ui/Sheet";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Pencil, Plus, Search, Trash, X } from "./ui/icons";

interface MethodDetailSheetProps {
  open: boolean;
  method: Method | null;
  problems: Problem[];
  onClose: () => void;
  onEdit: (m: Method) => void;
  onDelete: (id: string) => void;
  onOpenProblem: (id: string) => void;
  onUpdateProblem: (id: string, patch: Partial<ProblemDraft>) => void;
  onLightbox: (src: string, caption: string, downloadName?: string) => void;
}

function MiniThumb({ problem }: { problem: Problem }) {
  const img = problem.images.find((i) => i.kind === "problem") ?? problem.images[0];
  const url = useBlobUrl(img?.blob);
  return url ? <img src={url} alt={problem.title} /> : null;
}

export function MethodDetailSheet({
  open,
  method,
  problems,
  onClose,
  onEdit,
  onDelete,
  onOpenProblem,
  onUpdateProblem,
  onLightbox,
}: MethodDetailSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickQuery, setPickQuery] = useState("");

  const linked = useMemo(
    () =>
      method
        ? problems.filter((p) => p.methodLinks?.some((l) => l.methodId === method.id))
        : [],
    [method, problems]
  );
  const linkedIds = useMemo(() => new Set(linked.map((p) => p.id)), [linked]);
  const unlinked = useMemo(() => problems.filter((p) => !linkedIds.has(p.id)), [problems, linkedIds]);

  if (!method) return null;

  const updateLink = (problem: Problem, linkId: string, patch: Partial<{ role: MethodRole; note: string }>) => {
    onUpdateProblem(problem.id, {
      methodLinks: problem.methodLinks.map((l) => (l.id === linkId ? { ...l, ...patch } : l)),
    });
  };

  const addLink = (problem: Problem) => {
    onUpdateProblem(problem.id, {
      methodLinks: [
        ...problem.methodLinks,
        { id: uid(), methodId: method.id, role: "core", note: "" },
      ],
    });
  };

  const removeLink = (problem: Problem, linkId: string) => {
    onUpdateProblem(problem.id, {
      methodLinks: problem.methodLinks.filter((l) => l.id !== linkId),
    });
  };

  const pickList = unlinked.filter(
    (p) => !pickQuery.trim() || p.title.includes(pickQuery.trim())
  );

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={method.name}
        className="method-detail"
        footer={
          <>
            <button className="btn btn-ghost grow" onClick={() => onEdit(method)}>
              <Pencil size={15} />
              编辑
            </button>
            <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Trash size={15} />
              删除
            </button>
          </>
        }
      >
        <div className="detail-scroll">
          <div>
            <div className="row wrap" style={{ gap: 6 }}>
              {method.mastery && (
                <span className={`badge mastery lv${method.mastery.level}`}>
                  掌握度：{MASTERY_LABEL[method.mastery.level]}
                </span>
              )}
              {method.tags.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
              {method.tags.length === 0 && <span className="muted">暂无标签</span>}
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: "10px 0 0" }}>
              更新于 {formatDate(method.updatedAt)} · 关联题目 {linked.length} 道
            </p>
          </div>

          {method.signal && (
            <div className="signal method-signal">
              <b>什么时候想到它</b>
              {method.signal}
            </div>
          )}

          {method.steps.length > 0 && (
            <section>
              <p className="section-label">操作步骤</p>
              <ol className="method-steps">
                {method.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </section>
          )}

          {method.description && (
            <section>
              <p className="section-label">方法说明</p>
              <p className="method-desc">{method.description}</p>
            </section>
          )}

          {method.pitfalls && (
            <div className="pitfall">
              <b>易错点</b>
              {method.pitfalls}
            </div>
          )}

          {method.images.length > 0 && (
            <section className="method-images">
              <p className="section-label">图片（{method.images.length}）</p>
              <div className="step-list">
                {method.images.map((img, i) => (
                  <MethodImageRow key={img.id} img={img} index={i} onLightbox={onLightbox} />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <p className="section-label" style={{ margin: 0 }}>
                关联题目 ({linked.length})
              </p>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPickOpen((v) => !v);
                  setPickQuery("");
                }}
              >
                {pickOpen ? "完成" : "添加关联"}
              </button>
            </div>

            {linked.length === 0 && !pickOpen && (
              <p className="field-hint">还没有关联题目，点「添加关联」把用过这道方法的题挂上来。</p>
            )}

            {linked.map((p) => {
              const link = p.methodLinks.find((l) => l.methodId === method.id);
              if (!link) return null;
              return (
                <div key={p.id} className="linked-row linked-problem">
                  <button
                    className="mini-thumb"
                    onClick={() => onOpenProblem(p.id)}
                    aria-label={`打开 ${p.title}`}
                  >
                    <MiniThumb problem={p} />
                  </button>
                  <div className="linked-main">
                    <button className="linked-title" onClick={() => onOpenProblem(p.id)}>
                      {p.title}
                    </button>
                    <div className="linked-controls">
                      <select
                        className="select link-role"
                        value={link.role}
                        aria-label="关联角色"
                        onChange={(e) =>
                          updateLink(p, link.id, { role: e.target.value as MethodRole })
                        }
                      >
                        {ROLE_ORDER.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <input
                        className="input link-note"
                        value={link.note}
                        placeholder="备注：为什么用这招"
                        onChange={(e) => updateLink(p, link.id, { note: e.target.value })}
                      />
                      <button
                        className="icon-btn"
                        aria-label={`移除与 ${p.title} 的关联`}
                        onClick={() => removeLink(p, link.id)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {pickOpen && (
              <div className="pick-panel">
                <div className="search">
                  <span className="search-icon">
                    <Search size={15} />
                  </span>
                  <input
                    className="input"
                    placeholder="搜索题目标题…"
                    value={pickQuery}
                    onChange={(e) => setPickQuery(e.target.value)}
                  />
                </div>
                <div className="pick-list">
                  {pickList.slice(0, 20).map((p) => (
                    <button key={p.id} className="pick-item" onClick={() => addLink(p)}>
                      <span className="mini-thumb">
                        <MiniThumb problem={p} />
                      </span>
                      <span className="grow" style={{ textAlign: "left" }}>
                        {p.title}
                      </span>
                      <Plus size={15} />
                    </button>
                  ))}
                  {pickList.length === 0 && (
                    <p className="field-hint">没有可关联的题目（所有题目都已关联）。</p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="删除这个方法？"
        message="方法会被删除；已关联的题目不受影响，只是关联关系一并移除。"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          onDelete(method.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </>
  );
}

function MethodImageRow({
  img,
  index,
  onLightbox,
}: {
  img: { id: string; caption: string; blob: Blob };
  index: number;
  onLightbox: (src: string, caption: string, downloadName?: string) => void;
}) {
  const url = useBlobUrl(img.blob);
  return (
    <div
      className="step"
      role="button"
      tabIndex={0}
      onClick={() => url && onLightbox(url, img.caption || `方法图 ${index + 1}`, blobFileName(img.caption, img.blob))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && url) onLightbox(url, img.caption || `方法图 ${index + 1}`, blobFileName(img.caption, img.blob));
      }}
    >
      <span className="step-num">{index + 1}</span>
      {url && <img className="step-thumb" src={url} alt={img.caption} />}
      <span className="step-caption">{img.caption || `方法图 ${index + 1}`}</span>
    </div>
  );
}
