import { useState } from "react";
import type { Method, Problem, ProblemStatus } from "../types";
import { CLEVERNESS_LABEL, ROLE_LABEL, SIMPLICITY_LABEL, STATUS_LABEL } from "../types";
import { formatDateTime } from "../utils/format";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { FeltCurve } from "./ui/FeltCurve";
import { Sheet } from "./ui/Sheet";
import { Segmented } from "./ui/Segmented";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { DifficultyDots } from "./ui/Difficulty";
import { SolutionTheater } from "./SolutionTheater";
import {
  Bulb,
  ChevronRight,
  Download,
  Pencil,
  Play,
  Sparkle,
  Star,
  Trash,
} from "./ui/icons";

function fileName(caption: string, blob: Blob): string {
  const base = (caption || "image")
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const ext = blob.type.includes("jpeg")
    ? "jpg"
    : blob.type.includes("png")
      ? "png"
      : blob.type.includes("svg")
        ? "svg"
        : "png";
  return `${base || "image"}.${ext}`;
}

interface ProblemDetailSheetProps {
  open: boolean;
  problem: Problem | null;
  onClose: () => void;
  onEdit: (p: Problem) => void;
  onDelete: (id: string) => void;
  onStatusChange: (id: string, status: ProblemStatus) => void;
  onLightbox: (src: string, caption: string, downloadName?: string) => void;
  onOpenMethod: (id: string) => void;
  onExportImages: (p: Problem) => void;
  methods: Method[];
}

function DetailImage({
  blob,
  caption,
  className,
  onLightbox,
}: {
  blob: Blob;
  caption: string;
  className: string;
  onLightbox: (src: string, caption: string, downloadName?: string) => void;
}) {
  const url = useBlobUrl(blob);
  if (!url) return null;
  return (
    <div
      className={className}
      onClick={() => onLightbox(url, caption, fileName(caption, blob))}
      role="button"
      tabIndex={0}
    >
      <img src={url} alt={caption} />
    </div>
  );
}

export function ProblemDetailSheet({
  open,
  problem,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
  onLightbox,
  onOpenMethod,
  onExportImages,
  methods,
}: ProblemDetailSheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [theaterOpen, setTheaterOpen] = useState(false);

  const problemImage = problem?.images.find((i) => i.kind === "problem") ?? problem?.images[0];
  const solutions = problem?.solutions ?? [];
  const methodLinks = problem?.methodLinks ?? [];

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={problem?.title || "题目详情"}
        headerActions={
          problem && (
            <>
              <button
                className="icon-btn"
                onClick={() => setTheaterOpen(true)}
                aria-label="解法剧场"
                title="解法剧场"
              >
                <Play size={17} />
              </button>
              <button
                className="icon-btn export-images-btn"
                onClick={() => onExportImages(problem)}
                aria-label="导出图片到文件夹"
                title="导出图片到文件夹"
              >
                <Download size={17} />
              </button>
            </>
          )
        }
        footer={
          problem && (
            <>
              <button className="btn btn-ghost grow" onClick={() => onEdit(problem)}>
                <Pencil size={15} />
                编辑
              </button>
              <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash size={15} />
                删除
              </button>
            </>
          )
        }
      >
        {problem && (
          <div className="detail-scroll">
            {problemImage && (
              <div>
                <p className="section-label">
                  <Sparkle size={15} />
                  题目
                </p>
                <DetailImage
                  blob={problemImage.blob}
                  caption={problemImage.caption || "题目"}
                  className="detail-img"
                  onLightbox={onLightbox}
                />
              </div>
            )}

            {solutions.length === 0 ? (
              <p className="field-hint">
                还没有记录解法，点击「编辑」补充文字步骤或思路图片。
              </p>
            ) : (
              solutions.map((sol) => (
                <div key={sol.id}>
                  <p className="section-label">
                    <Sparkle size={15} />
                    {sol.label || "解法"}
                    <span className={`badge simplicity s${sol.simplicity ?? 2}`}>
                      {SIMPLICITY_LABEL[sol.simplicity ?? 2]}
                    </span>
                    {sol.clever === true && (
                      <span className="badge clever">
                        <Sparkle size={11} />
                        妙解
                      </span>
                    )}
                  </p>
                  {sol.steps.length > 0 && (
                    <ol className="thought-steps">
                      {sol.steps.map((s) => (
                        <li key={s.id}>
                          <span className="step-text">{s.text}</span>
                          {s.starred && (
                            <span
                              className="cleverness-badge"
                              title={`巧妙程度：${CLEVERNESS_LABEL[s.cleverness]}`}
                            >
                              <Star size={11} />
                              {CLEVERNESS_LABEL[s.cleverness]}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                  {sol.image && (
                    <DetailImage
                      blob={sol.image.blob}
                      caption={sol.image.caption || sol.label || "思路"}
                      className="detail-img solution-img"
                      onLightbox={onLightbox}
                    />
                  )}
                  {sol.steps.length === 0 && !sol.image && (
                    <p className="field-hint">这组解法还没有内容。</p>
                  )}
                </div>
              ))
            )}

            <div className="method-links">
              <p className="section-label">
                <Bulb size={15} />
                用到的方法
              </p>
              {methodLinks.length === 0 ? (
                <p className="field-hint">暂未关联方法，可在编辑时把这道题挂到方法库上。</p>
              ) : (
                <div className="link-list">
                  {methodLinks.map((l) => {
                    const m = methods.find((x) => x.id === l.methodId);
                    return (
                      <button
                        key={l.id}
                        className="method-link"
                        onClick={() => m && onOpenMethod(m.id)}
                      >
                        <span className={`role-badge ${l.role}`}>{ROLE_LABEL[l.role]}</span>
                        <span className="link-name">{m?.name ?? "未知方法"}</span>
                        {l.note && <span className="link-note">{l.note}</span>}
                        <ChevronRight size={14} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="section-label">状态</p>
              <Segmented
                id={`status-${problem.id}`}
                value={problem.status}
                options={(Object.keys(STATUS_LABEL) as ProblemStatus[]).map((s) => ({
                  value: s,
                  label: STATUS_LABEL[s],
                }))}
                onChange={(s) => onStatusChange(problem.id, s)}
              />
            </div>

            <div className="meta-grid">
              <div className="meta-row">
                <span className="k">难度</span>
                <span className="v row">
                  <DifficultyDots value={problem.difficulty} />
                </span>
              </div>
              {(problem.feltHistory?.length ?? 0) > 0 && (
                <div className="meta-row">
                  <span className="k">认知曲线</span>
                  <span className="v row felt-curve-meta">
                    <FeltCurve history={problem.feltHistory!} height={40} />
                    <span className="muted">
                      {problem.feltHistory!.length} 次记录
                    </span>
                  </span>
                </div>
              )}
              {problem.source && (
                <div className="meta-row">
                  <span className="k">来源</span>
                  <span className="v">{problem.source}</span>
                </div>
              )}
              <div className="meta-row">
                <span className="k">标签</span>
                <span className="v row wrap" style={{ gap: 6 }}>
                  {problem.tags.map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                  {problem.tags.length === 0 && <span className="muted">无</span>}
                </span>
              </div>
              <div className="meta-row">
                <span className="k">更新</span>
                <span className="v muted">{formatDateTime(problem.updatedAt)}</span>
              </div>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="删除这道题？"
        message="题目与所有思路图片都会被删除，此操作无法撤销。"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (problem) onDelete(problem.id);
          setConfirmDelete(false);
          onClose();
        }}
      />

      <SolutionTheater
        open={theaterOpen}
        problem={problem}
        onClose={() => setTheaterOpen(false)}
      />
    </>
  );
}
