import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, Tag, X } from "./icons";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}

export function TagInput({ tags, onChange, suggestions, placeholder = "添加标签" }: TagInputProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => {
    const q = query.trim();
    return suggestions
      .filter((t) => (q ? t.includes(q) : true))
      .slice(0, 24);
  }, [query, suggestions]);

  const commit = (value: string) => {
    const t = value.trim();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]);
    setQuery("");
  };

  const toggle = (t: string) => {
    onChange(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  };

  const newTagHint = query.trim() && !suggestions.includes(query.trim());

  return (
    <div>
      <div className="tag-input" onClick={() => inputRef.current?.focus()}>
        <Tag size={15} style={{ color: "var(--text-3)", flexShrink: 0 }} />
        {tags.map((t) => (
          <span key={t} className="chip accent">
            {t}
            <button
              aria-label={`移除 ${t}`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          placeholder={tags.length ? "" : placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(query);
            } else if (e.key === "Backspace" && !query && tags.length) {
              onChange(tags.slice(0, -1));
            }
          }}
        />
      </div>
      {visible.length > 0 && (
        <div className="tag-pick-list">
          {visible.map((t) => {
            const active = tags.includes(t);
            return (
              <motion.button
                key={t}
                type="button"
                data-tag={t}
                className={`tag-pick-chip ${active ? "active" : ""}`}
                whileTap={{ scale: 0.94 }}
                onClick={() => toggle(t)}
                aria-pressed={active}
              >
                {active && <Check size={12} />}
                {t}
              </motion.button>
            );
          })}
        </div>
      )}
      {newTagHint && (
        <p className="field-hint" style={{ marginTop: 6 }}>
          回车创建新标签「{query.trim()}」
        </p>
      )}
    </div>
  );
}
