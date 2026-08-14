import { useEffect, useState } from "react";
import type {
  Method,
  MethodRole,
  Problem,
  ProblemDraft,
  ProblemImage,
  ProblemSolution,
  ProblemStatus,
  SolutionSimplicity,
  ThoughtStep,
} from "../types";
import {
  CLEVERNESS_LABEL,
  ROLE_LABEL,
  ROLE_ORDER,
  SIMPLICITY_LABEL,
  STATUS_LABEL,
} from "../types";
import { uid } from "../utils/id";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { processImageFile } from "../utils/image";
import { Sheet } from "./ui/Sheet";
import { Segmented } from "./ui/Segmented";
import { DifficultyPicker } from "./ui/Difficulty";
import { TagInput } from "./ui/TagInput";
import { ImageDropzone } from "./ui/ImageDropzone";
import { MethodPicker } from "./MethodPicker";
import { Plus, Sparkle, Star, Trash, X } from "./ui/icons";

const CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

interface LocalImage {
  id: string;
  blob: Blob;
  caption: string;
}

interface LocalSolution {
  id: string;
  label: string;
  steps: ThoughtStep[];
  image: LocalImage | null;
  simplicity: SolutionSimplicity;
  clever: boolean;
}

interface FormState {
  title: string;
  status: ProblemStatus;
  difficulty: 1 | 2 | 3 | 4 | 5;
  source: string;
  tags: string[];
  problem: LocalImage | null;
  solutions: LocalSolution[];
  links: { id: string; methodId: string; role: MethodRole; note: string }[];
}

const blankStep = (): ThoughtStep => ({
  id: uid(),
  text: "",
  starred: false,
  cleverness: 1,
});

function newSolution(index: number): LocalSolution {
  return {
    id: uid(),
    label: `解法${CN_NUM[index] ?? index + 1}`,
    steps: [blankStep()],
    image: null,
    simplicity: 2,
    clever: false,
  };
}

function blank(): FormState {
  return {
    title: "",
    status: "todo",
    difficulty: 2,
    source: "",
    tags: [],
    problem: null,
    solutions: [newSolution(0)],
    links: [],
  };
}

function fromProblem(p: Problem): FormState {
  const sols = (p.solutions?.length ? p.solutions : []).map((s) => ({
    id: s.id,
    label: s.label,
    steps: s.steps.map((x) => ({ ...x })),
    image: s.image ? { id: s.image.id, blob: s.image.blob, caption: s.image.caption } : null,
    simplicity: s.simplicity ?? 2,
    clever: s.clever === true,
  }));
  return {
    title: p.title,
    status: p.status,
    difficulty: p.difficulty,
    source: p.source,
    tags: [...p.tags],
    problem: (() => {
      const img = p.images.find((i) => i.kind === "problem") ?? p.images[0];
      return img ? { id: img.id, blob: img.blob, caption: img.caption } : null;
    })(),
    solutions: sols.length ? sols : [newSolution(0)],
    links: p.methodLinks.map((l) => ({ ...l })),
  };
}

function toLocal(file: File | Blob, caption = ""): LocalImage {
  return { id: uid(), blob: file, caption };
}

interface ProblemFormSheetProps {
  open: boolean;
  initial: Problem | null;
  tags: string[];
  methods: Method[];
  onQuickCreateMethod: (name: string, signal: string) => Promise<Method>;
  onClose: () => void;
  onSave: (draft: ProblemDraft) => Promise<void>;
}

export function ProblemFormSheet({
  open,
  initial,
  tags,
  methods,
  onQuickCreateMethod,
  onClose,
  onSave,
}: ProblemFormSheetProps) {
  const [form, setForm] = useState<FormState>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addLink = (methodId: string) => {
    setForm((f) => ({
      ...f,
      links: [...f.links, { id: uid(), methodId, role: "core", note: "" }],
    }));
  };

  useEffect(() => {
    if (open) {
      setForm(initial ? fromProblem(initial) : blank());
      setError(null);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length === 0) return;
      e.preventDefault();
      void processImageFile(files[0]).then((blob) =>
        setForm((f) => {
          const idx = f.solutions.findIndex((s) => !s.image);
          const target = idx === -1 ? 0 : idx;
          return {
            ...f,
            solutions: f.solutions.map((s, i) =>
              i === target ? { ...s, image: toLocal(blob) } : s
            ),
          };
        })
      );
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const canSave = !!form.problem && !saving;

  const handleSave = async () => {
    if (!form.problem || saving) return;
    const images: ProblemImage[] = [
      { id: form.problem.id, kind: "problem", caption: "题干", blob: form.problem.blob },
    ];
    const solutions: ProblemSolution[] = form.solutions
      .map((s, i) => ({
        id: s.id,
        label: s.label.trim() || `解法${CN_NUM[i] ?? i + 1}`,
        simplicity: s.simplicity,
        clever: s.clever,
        steps: s.steps
          .filter((x) => x.text.trim())
          .map((x) => ({
            id: x.id,
            text: x.text.trim(),
            starred: x.starred,
            cleverness: x.cleverness,
          })),
        image: s.image
          ? { id: s.image.id, caption: s.image.caption.trim(), blob: s.image.blob }
          : null,
      }))
      .filter((s) => s.steps.length > 0 || s.image);
    if (solutions.length === 0) solutions.push(newSolution(0));

    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: form.title.trim() || "未命名题目",
        status: form.status,
        difficulty: form.difficulty,
        source: form.source.trim(),
        tags: form.tags,
        images,
        solutions,
        methodLinks: form.links.map((l) => ({
          id: l.id,
          methodId: l.methodId,
          role: l.role,
          note: l.note.trim(),
        })),
      });
      onClose();
    } catch (e) {
      setError((e as Error).message || "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const updateSolution = (id: string, patch: Partial<LocalSolution>) => {
    setForm((f) => ({
      ...f,
      solutions: f.solutions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "编辑题目" : "新增题目"}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary grow" disabled={!canSave} onClick={handleSave}>
            {saving ? "保存中…" : "保存题目"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="field">
          <label className="field-label" htmlFor="pf-title">
            标题
          </label>
          <input
            id="pf-title"
            className="input"
            placeholder="一句话概括这道题，便于以后检索"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>

        <div className="field">
          <span className="field-label">
            题干图片 <span style={{ color: "var(--red-text)" }}>*</span>
          </span>
          {form.problem ? (
            <div className="img-row">
              <div className="img-tile">
                <ProblemThumb img={form.problem} />
                <span className="kind-tag">题干</span>
                <button
                  className="remove"
                  aria-label="移除题干图片"
                  onClick={() => setForm((f) => ({ ...f, problem: null }))}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : null}
          <ImageDropzone
            label={form.problem ? "替换题干图片" : "点击上传或拖入题干截图"}
            hint="题目必须有一张图片，建议截图或拍照"
            onFiles={async (files) => {
              if (files[0]) {
                const blob = await processImageFile(files[0]);
                setForm((f) => ({ ...f, problem: toLocal(blob) }));
              }
            }}
          />
        </div>

        <div className="field">
          <span className="field-label">
            解法（一题多解）
            <span className="field-hint" style={{ marginLeft: 8 }}>
              每组解法可独立命名、记步骤、附图；用不上的解法可删除
            </span>
          </span>
          <div className="solution-list">
            {form.solutions.map((sol, i) => (
              <div key={sol.id} className="solution-editor">
                <div className="solution-editor-head">
                  <span className="solution-index">解法 {i + 1}</span>
                  <input
                    className="input grow solution-label"
                    value={sol.label}
                    placeholder="解法名称（如：判别式法、数形结合）"
                    aria-label={`解法${i + 1}名称`}
                    onChange={(e) => updateSolution(sol.id, { label: e.target.value })}
                  />
                  {form.solutions.length > 1 && (
                    <button
                      className="icon-btn solution-remove"
                      type="button"
                      aria-label={`删除${sol.label || `解法${i + 1}`}`}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          solutions: f.solutions.filter((s) => s.id !== sol.id),
                        }))
                      }
                    >
                      <Trash size={15} />
                    </button>
                  )}
                </div>

                <div className="solution-meta">
                  <span className="solution-meta-label">简易度</span>
                  <Segmented
                    id={`sol-sim-${sol.id}`}
                    value={String(sol.simplicity) as "1" | "2" | "3"}
                    options={[
                      { value: "1", label: SIMPLICITY_LABEL[1] },
                      { value: "2", label: SIMPLICITY_LABEL[2] },
                      { value: "3", label: SIMPLICITY_LABEL[3] },
                    ]}
                    onChange={(v) =>
                      updateSolution(sol.id, {
                        simplicity: Number(v) as SolutionSimplicity,
                      })
                    }
                  />
                  <button
                    type="button"
                    className={`btn btn-ghost clever-toggle ${sol.clever ? "on" : ""}`}
                    aria-pressed={sol.clever}
                    onClick={() => updateSolution(sol.id, { clever: !sol.clever })}
                  >
                    <Sparkle size={14} />
                    妙解
                  </button>
                </div>

                <div className="thought-steps-editor">
                  <div className="steps-edit-list">
                    {sol.steps.map((s, j) => (
                      <div key={s.id} className="step-edit-row-text">
                        <span className="step-num">{j + 1}</span>
                        <button
                          type="button"
                          className={`thought-star-btn ${s.starred ? "on" : ""}`}
                          aria-pressed={s.starred}
                          aria-label={s.starred ? "取消标星收藏" : "标星收藏到巧思库"}
                          onClick={() =>
                            updateSolution(sol.id, {
                              steps: sol.steps.map((x, k) =>
                                k === j ? { ...x, starred: !x.starred } : x
                              ),
                            })
                          }
                        >
                          <Star size={15} />
                        </button>
                        <input
                          className="input grow"
                          value={s.text}
                          placeholder={`第 ${j + 1} 步 · 破题想法`}
                          onChange={(e) =>
                            updateSolution(sol.id, {
                              steps: sol.steps.map((x, k) =>
                                k === j ? { ...x, text: e.target.value } : x
                              ),
                            })
                          }
                        />
                        {s.starred && (
                          <div className="thought-cleverness" role="group" aria-label="巧妙程度">
                            {([1, 2, 3, 4, 5] as const).map((n) => (
                              <button
                                key={n}
                                type="button"
                                data-level={n}
                                className={s.cleverness === n ? "active" : ""}
                                title={CLEVERNESS_LABEL[n]}
                                onClick={() =>
                                  updateSolution(sol.id, {
                                    steps: sol.steps.map((x, k) =>
                                      k === j ? { ...x, cleverness: n } : x
                                    ),
                                  })
                                }
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          className="icon-btn"
                          type="button"
                          aria-label="删除该步骤"
                          onClick={() =>
                            updateSolution(sol.id, {
                              steps: sol.steps.filter((_, k) => k !== j),
                            })
                          }
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost thought-add-step"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() =>
                      updateSolution(sol.id, { steps: [...sol.steps, blankStep()] })
                    }
                  >
                    <Plus size={14} />
                    添加步骤
                  </button>
                </div>

                <div className="solution-img-area">
                  {sol.image ? (
                    <div className="img-row">
                      <div className="img-tile">
                        <ProblemThumb img={sol.image} />
                        <input
                          className="tile-caption"
                          value={sol.image.caption}
                          placeholder="图片说明"
                          onChange={(e) =>
                            updateSolution(sol.id, {
                              image: { ...sol.image!, caption: e.target.value },
                            })
                          }
                        />
                        <span className="kind-tag">思路图</span>
                        <button
                          className="remove"
                          type="button"
                          aria-label="移除思路图片"
                          onClick={() => updateSolution(sol.id, { image: null })}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <ImageDropzone
                    label={sol.image ? "替换思路图" : "添加思路图（一张）"}
                    hint="示意图、关键一步的截图；Ctrl+V 也可以直接粘贴"
                    onFiles={async (files) => {
                      if (files[0]) {
                        const blob = await processImageFile(files[0]);
                        updateSolution(sol.id, { image: toLocal(blob) });
                      }
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost solution-add"
            style={{ alignSelf: "flex-start" }}
            onClick={() =>
              setForm((f) => ({
                ...f,
                solutions: [...f.solutions, newSolution(f.solutions.length)],
              }))
            }
          >
            <Plus size={14} />
            添加另一种解法
          </button>
        </div>

        <div className="field">
          <span className="field-label">状态</span>
          <Segmented
            id="pf-status"
            value={form.status}
            options={(Object.keys(STATUS_LABEL) as ProblemStatus[]).map((s) => ({
              value: s,
              label: STATUS_LABEL[s],
            }))}
            onChange={(status) => setForm((f) => ({ ...f, status }))}
          />
        </div>

        <div className="field">
          <span className="field-label">难度</span>
          <DifficultyPicker
            value={form.difficulty}
            onChange={(difficulty) => setForm((f) => ({ ...f, difficulty }))}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="pf-source">
            来源
          </label>
          <input
            id="pf-source"
            className="input"
            placeholder="如：课后提升、真题改编、某本书…"
            value={form.source}
            onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
          />
        </div>

        <div className="field">
          <span className="field-label">标签</span>
          <TagInput
            tags={form.tags}
            onChange={(tags) => setForm((f) => ({ ...f, tags }))}
            suggestions={tags}
            placeholder="如：导数、构造法、对称式"
          />
        </div>

        <div className="field method-link-editor">
          <span className="field-label">
            关联方法
            <span className="field-hint" style={{ marginLeft: 8 }}>
              可选：把这道题显式挂到方法库的方法上，标签之外的精确关系
            </span>
          </span>
          {form.links.length > 0 && (
            <div className="link-edit-list">
              {form.links.map((l) => {
                const m = methods.find((x) => x.id === l.methodId);
                return (
                  <div key={l.id} className="link-row">
                    <span className="link-name">{m?.name ?? "未知方法"}</span>
                    <select
                      className="select link-role"
                      value={l.role}
                      aria-label={`${m?.name ?? "方法"}的角色`}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          links: f.links.map((x) =>
                            x.id === l.id ? { ...x, role: e.target.value as MethodRole } : x
                          ),
                        }))
                      }
                    >
                      {ROLE_ORDER.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input grow link-note"
                      value={l.note}
                      placeholder="备注（为什么用这招？）"
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          links: f.links.map((x) =>
                            x.id === l.id ? { ...x, note: e.target.value } : x
                          ),
                        }))
                      }
                    />
                    <button
                      className="icon-btn"
                      type="button"
                      aria-label={`移除关联 ${m?.name ?? "方法"}`}
                      onClick={() =>
                        setForm((f) => ({ ...f, links: f.links.filter((x) => x.id !== l.id) }))
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {methods.length === 0 ? (
            <p className="field-hint">方法库还是空的，先去「方法库」新建一条方法。</p>
          ) : (
            <MethodPicker
              methods={methods}
              linkedMethodIds={form.links.map((l) => l.methodId)}
              tags={form.tags}
              onPick={addLink}
              onQuickCreate={onQuickCreateMethod}
            />
          )}
        </div>

        {!form.problem && (
          <p className="field-hint" style={{ color: "var(--red-text)" }}>
            <Sparkle size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            还需要一张题干图片才能保存
          </p>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    </Sheet>
  );
}

function ProblemThumb({ img }: { img: LocalImage }) {
  const url = useBlobUrl(img.blob);
  return url ? <img src={url} alt="题目图片" /> : null;
}
