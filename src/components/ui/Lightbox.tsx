import { useEffect } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Download, X } from "./icons";

interface LightboxProps {
  src: string;
  caption?: string;
  downloadName?: string;
  onClose: () => void;
}

export function Lightbox({ src, caption, downloadName, onClose }: LightboxProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      className="lightbox"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.35 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <motion.img
        src={src}
        alt={caption ?? "题目图片"}
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? { opacity: 0 } : { scale: 0.93, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0.14, duration: 0.5 }}
      />
      {caption && (
        <motion.p
          className="caption"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        >
          {caption}
        </motion.p>
      )}
      {downloadName && (
        <a
          className="download"
          href={src}
          download={downloadName}
          onClick={(e) => e.stopPropagation()}
          aria-label="下载原图"
          title="下载原图"
        >
          <Download size={19} />
        </a>
      )}
      <button className="close" onClick={onClose} aria-label="关闭预览">
        <X size={20} />
      </button>
    </motion.div>
  );
}
