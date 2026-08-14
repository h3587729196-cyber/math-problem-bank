import type { ReactNode } from "react";
import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { X } from "./icons";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  headerActions?: ReactNode;
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className = "",
  headerActions,
}: SheetProps) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const hidden = reduce ? { opacity: 0 } : desktop ? { x: "100%" } : { y: "100%" };
  const shown = reduce ? { opacity: 1 } : { x: 0, y: 0 };
  const spring = reduce
    ? { duration: 0.15 }
    : { type: "spring" as const, bounce: 0.22, duration: 0.5 };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.15 } : { type: "spring", bounce: 0, duration: 0.32 }}
            onClick={onClose}
          />
          <motion.aside
            key="sheet"
            className={`sheet ${desktop ? "right" : "bottom"} ${className}`}
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={spring}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="sheet-header">
              <h2 className="sheet-title">{title}</h2>
              <div className="header-actions">
                {headerActions}
                <button className="icon-btn" onClick={onClose} aria-label="关闭">
                  <X />
                </button>
              </div>
            </div>
            <div className="sheet-body">{children}</div>
            {footer && <div className="sheet-footer">{footer}</div>}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
