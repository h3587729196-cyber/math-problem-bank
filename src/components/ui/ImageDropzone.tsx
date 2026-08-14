import { useRef, useState } from "react";
import { motion } from "motion/react";
import { ImageIcon } from "./icons";

interface ImageDropzoneProps {
  label: string;
  hint?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => Promise<void> | void;
}

export function ImageDropzone({ label, hint, multiple = false, onFiles }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (list: FileList | null) => {
    if (!list || busy) return;
    setError(null);
    const all = Array.from(list);
    const files = all.filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      if (all.length > 0) setError("只能添加图片文件（JPG / PNG / WebP / GIF / SVG）");
      return;
    }
    setBusy(true);
    try {
      await onFiles(files);
    } catch (e) {
      setError((e as Error).message || "图片处理失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />
      <motion.div
        className={`dropzone ${drag ? "drag" : ""} ${busy ? "busy" : ""}`}
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label={label}
        aria-busy={busy}
        whileTap={busy ? undefined : { scale: 0.99 }}
        onClick={() => {
          if (!busy) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handle(e.dataTransfer.files);
        }}
      >
        <div>
          <ImageIcon size={26} style={{ margin: "0 auto 8px" }} />
          <strong>{busy ? "正在压缩图片…" : label}</strong>
          <span>{busy ? "请稍候" : (hint ?? "点击选择或拖入图片，也可以直接 Ctrl+V 粘贴")}</span>
        </div>
      </motion.div>
      {error && (
        <p className="dropzone-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
