import { motion } from "motion/react";
import { DIFFICULTY_LABEL } from "../../utils/format";

export function DifficultyDots({ value }: { value: number }) {
  return (
    <span className="dots" aria-label={`难度 ${DIFFICULTY_LABEL[value]}`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i <= value ? "on" : ""} />
      ))}
    </span>
  );
}

export function DifficultyPicker({
  value,
  onChange,
}: {
  value: 1 | 2 | 3 | 4 | 5;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <motion.button
          key={n}
          type="button"
          whileTap={{ scale: 0.92 }}
          className={`btn btn-ghost ${value === n ? "active-diff" : ""}`}
          style={{ padding: "7px 12px" }}
          onClick={() => onChange(n)}
          aria-pressed={value === n}
        >
          {DIFFICULTY_LABEL[n]}
        </motion.button>
      ))}
    </div>
  );
}
