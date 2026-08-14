import { motion } from "motion/react";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  id: string;
}

export function Segmented<T extends string>({ value, options, onChange, id }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="tablist" aria-label="切换">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <motion.button
            key={o.value}
            role="tab"
            aria-selected={active}
            className={active ? "active" : ""}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(o.value)}
          >
            {active && (
              <motion.span
                className="seg-pill"
                layoutId={`seg-${id}`}
                transition={{ type: "spring", bounce: 0.25, duration: 0.5 }}
              />
            )}
            {o.label}
          </motion.button>
        );
      })}
    </div>
  );
}
