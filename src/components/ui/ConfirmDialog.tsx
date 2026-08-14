import { AnimatePresence, motion, useReducedMotion } from "motion/react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "删除",
  cancelLabel = "取消",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reduce ? { duration: 0.12 } : { type: "spring", bounce: 0, duration: 0.3 }}
          onClick={onCancel}
        >
          <motion.div
            className="dialog-card"
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? { opacity: 0 } : { scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={reduce ? { duration: 0.12 } : { type: "spring", bounce: 0.2, duration: 0.42 }}
          >
            <h3>{title}</h3>
            <p>{message}</p>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={onCancel}>
                {cancelLabel}
              </button>
              <button className="btn btn-danger" onClick={onConfirm} autoFocus>
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
