import { useEffect, useState } from "react";
import type { Method, MethodMasteryLevel } from "../types";
import { MASTERY_LABEL } from "../types";
import { uid } from "../utils/id";
import { useBlobUrl } from "../hooks/useBlobUrl";
import { processImageFile } from "../utils/image";
import { Sheet } from "./ui/Sheet";
import { TagInput } from "./ui/TagInput";
import { ImageDropzone } from "./ui/ImageDropzone";
import { Plus, X } from "./ui/icons";

interface LocalImage {
  id: string;
  blob: Blob;
  caption: string;
}

interface MethodFormSheetProps {
  open: boolean;
  initial: Method | null;
  tags: string[];
  onClose: () => void;
  onSave: (draft: Omit<Method, "id" | "createdAt" | "updatedAt">) => Promise<void>;
}

export function MethodFormSheet({ open, initial, tags, onClose, onSave }: MethodFormSheetProps) {
  const [name, setName] = useState("");
  const [signal, setSignal] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [pitfalls, setPitfalls] = useState("");
  const [images, setImages] = useState<LocalImage[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mastery, setMastery] = useState<0 | MethodMasteryLevel>(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(initial?.name ?? "");
    setSignal(initial?.signal ?? "");
    setDescription(initial?.description ?? "");
    setSteps(initial?.steps?.length ? initial.steps : [""]);
    setPitfalls(initial?.pitfalls ?? "");
    setImages(
      (initial?.images ?? []).map((img) => ({
        id: img.id,
        blob: img.blob,
        caption: img.caption,
      }))
    );
    setSelectedTags(initial?.tags ?? []);
    setMastery(initial?.mastery?.level ?? 0);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length === 0) return;
      e.preventDefault();
      void Promise.all(files.map((f) => processImageFile(f))).then((blobs) =>
        setImages((prev) => [
          ...prev,
          ...blobs.map((blob) => ({ id: uid(), blob, caption: "" })),
        ])
      );
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        signal: signal.trim(),
        description: description.trim(),
        steps: steps.map((s) => s.trim()).filter(Boolean),
        pitfalls: pitfalls.trim(),
        mastery: mastery ? { level: mastery, updatedAt: Date.now() } : undefined,
        images: images.map((img) => ({
          id: img.id,
          caption: img.caption.trim(),
          blob: img.blob,
        })),
        tags: selectedTags,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message || "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? "编辑方法" : "新建方法"}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary grow" disabled={!canSave} onClick={handleSave}>
            {saving ? "保存中…" : "保存方法"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="field">
          <label className="field-label" htmlFor="mf-name">
            方法名称 <span style={{ color: "var(--red-text)" }}>*</span>
          </label>
          <input
            id="mf-name"
            className="input"
            placeholder="如：对称式先算基本对称量"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="mf-signal">
            什么时候想到它
          </label>
          <input
            id="mf-signal"
            className="input"
            placeholder="看到什么特征、什么关键词就该用这招？"
            value={signal}
            onChange={(e) => setSignal(e.target.value)}
          />
        </div>
        <div className="field">
          <span className="field-label">操作步骤</span>
          <div className="steps-edit-list">
            {steps.map((s, i) => (
              <div key={i} className="step-edit-row-text">
                <span className="step-num">{i + 1}</span>
                <input
                  id={i === 0 ? "mf-steps" : undefined}
                  className="input grow"
                  value={s}
                  placeholder={`第 ${i + 1} 步`}
                  onChange={(e) =>
                    setSteps((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
                <button
                  className="icon-btn"
                  type="button"
                  aria-label="删除该步骤"
                  onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setSteps((prev) => [...prev, ""])}
          >
            <Plus size={14} />
            添加步骤
          </button>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="mf-desc">
            方法描述
          </label>
          <textarea
            id="mf-desc"
            className="textarea"
            placeholder="这招怎么做、适用场景、容易踩的坑…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="mf-pitfalls">
            易错点 / 注意
          </label>
          <textarea
            id="mf-pitfalls"
            className="textarea"
            placeholder="方向反了、符号错了、取等条件、边界情况…"
            value={pitfalls}
            onChange={(e) => setPitfalls(e.target.value)}
          />
        </div>
        <div className="field method-images">
          <span className="field-label">
            图片
            <span className="field-hint" style={{ marginLeft: 8 }}>
              示意图、公式笔记、参考截图，可多张；Ctrl+V 直接粘贴
            </span>
          </span>
          {images.length > 0 && (
            <div className="img-row">
              {images.map((img, i) => (
                <div key={img.id} className="img-tile method-img-tile">
                  <MethodTileThumb blob={img.blob} />
                  <input
                    className="tile-caption"
                    value={img.caption}
                    placeholder={`图 ${i + 1}`}
                    onChange={(e) =>
                      setImages((prev) =>
                        prev.map((x) => (x.id === img.id ? { ...x, caption: e.target.value } : x))
                      )
                    }
                  />
                  <span className="kind-tag">图 {i + 1}</span>
                  <button
                    className="remove"
                    type="button"
                    aria-label="移除图片"
                    onClick={() => setImages((prev) => prev.filter((x) => x.id !== img.id))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <ImageDropzone
            label="添加方法图片"
            hint="点击上传或拖入图片"
            multiple
            onFiles={async (files) => {
              const blobs = await Promise.all(files.map((f) => processImageFile(f)));
              setImages((prev) => [
                ...prev,
                ...blobs.map((blob) => ({ id: uid(), blob, caption: "" })),
              ]);
            }}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="mf-mastery">
            掌握度
          </label>
          <select
            id="mf-mastery"
            className="select"
            value={mastery}
            onChange={(e) => setMastery(Number(e.target.value) as 0 | MethodMasteryLevel)}
          >
            <option value={0}>未设置</option>
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <option key={n} value={n}>
                {n} · {MASTERY_LABEL[n]}
              </option>
            ))}
          </select>
          <span className="field-hint">按掌握程度分级：了解 → 会用 → 熟练 → 精通 → 融会贯通。</span>
        </div>

        <div className="field">
          <span className="field-label">关联标签</span>
          <TagInput
            tags={selectedTags}
            onChange={setSelectedTags}
            suggestions={tags}
            placeholder="打上知识点标签，自动关联题库"
          />
          <span className="field-hint">方法会和带相同标签的题目自动关联。</span>
        </div>
        {error && <p className="form-error">{error}</p>}
      </div>
    </Sheet>
  );
}

function MethodTileThumb({ blob }: { blob: Blob }) {
  const url = useBlobUrl(blob);
  return url ? <img src={url} alt="" /> : null;
}
