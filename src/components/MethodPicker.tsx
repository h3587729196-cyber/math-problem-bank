import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Method } from "../types";
import { Plus, Search } from "./ui/icons";

interface MethodPickerProps {
  methods: Method[];
  linkedMethodIds: string[];
  tags: string[];
  onPick: (methodId: string) => void;
  onQuickCreate: (name: string, signal: string) => Promise<Method>;
}

export function MethodPicker({
  methods,
  linkedMethodIds,
  tags,
  onPick,
  onQuickCreate,
}: MethodPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [signal, setSignal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = useMemo(
    () => methods.filter((m) => !linkedMethodIds.includes(m.id)),
    [methods, linkedMethodIds]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return available.filter((m) => {
      if (!q) return true;
      const hay = [m.name, m.signal, m.description, ...m.tags].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [available, query]);

  const recommended = useMemo(() => {
    if (tags.length === 0) return [];
    return filtered
      .map((m) => ({ m, overlap: m.tags.filter((t) => tags.includes(t)).length }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || b.m.updatedAt - a.m.updatedAt)
      .map((x) => x.m);
  }, [filtered, tags]);

  const others = useMemo(() => {
    const recIds = new Set(recommended.map((m) => m.id));
    return filtered
      .filter((m) => !recIds.has(m.id))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [filtered, recommended]);

  const saveNew = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const m = await onQuickCreate(name.trim(), signal.trim());
      onPick(m.id);
      setCreating(false);
      setName("");
      setSignal("");
      setQuery("");
    } catch (e) {
      setError((e as Error).message || "创建失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="method-picker">
      <motion.button
        type="button"
        className="btn btn-ghost method-picker-trigger"
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          setOpen((v) => !v);
          setCreating(false);
        }}
      >
        <Search size={15} />
        <span className="grow" style={{ textAlign: "left" }}>
          {available.length > 0
            ? `搜索并选择方法（可多选，还剩 ${available.length} 个未关联）`
            : "方法库的方法已全部关联"}
        </span>
        <Plus size={14} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="method-picker-panel"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            {creating ? (
              <div className="quick-create">
                <input
                  id="quick-method-name"
                  className="input"
                  placeholder="新方法名称"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  id="quick-method-signal"
                  className="input"
                  placeholder="什么时候想到它（可选）"
                  value={signal}
                  onChange={(e) => setSignal(e.target.value)}
                />
                {error && <p className="backup-msg err">{error}</p>}
                <div className="row">
                  <button
                    className="btn btn-primary quick-method-save"
                    disabled={!name.trim() || busy}
                    onClick={() => void saveNew()}
                  >
                    {busy ? "创建中…" : "保存并关联"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setCreating(false)}>
                    返回
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="search">
                  <span className="search-icon">
                    <Search size={15} />
                  </span>
                  <input
                    className="input method-picker-search"
                    placeholder="按名称、信号、标签搜索…"
                    value={query}
                    autoFocus
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>

                {recommended.length > 0 && (
                  <>
                    <p className="method-pick-recommend">推荐（与题目标签相近）</p>
                    {recommended.slice(0, 6).map((m) => (
                      <PickRow key={m.id} method={m} onPick={() => onPick(m.id)} />
                    ))}
                  </>
                )}
                {others.length > 0 && (
                  <>
                    {recommended.length > 0 && <p className="method-pick-recommend">全部方法</p>}
                    {others.slice(0, 12).map((m) => (
                      <PickRow key={m.id} method={m} onPick={() => onPick(m.id)} />
                    ))}
                  </>
                )}

                {filtered.length === 0 && (
                  <p className="field-hint">没有匹配的方法，可以直接新建：</p>
                )}
                <button className="method-pick-new" onClick={() => setCreating(true)}>
                  <Plus size={15} />
                  没找到？新建方法并关联
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PickRow({ method, onPick }: { method: Method; onPick: () => void }) {
  return (
    <button className="method-pick-row" onClick={onPick}>
      <span className="name">{method.name}</span>
      {method.tags.slice(0, 3).map((t) => (
        <span key={t} className="chip">
          {t}
        </span>
      ))}
    </button>
  );
}
