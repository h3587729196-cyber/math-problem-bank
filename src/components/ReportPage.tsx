import { useEffect, useMemo, useState } from "react";
import type { Method, Problem } from "../types";
import { getEvents, type AppEvent } from "../db/events";
import { buildReport, type RangeBounds, type ReportRange } from "../utils/report";
import { formatDateTime } from "../utils/format";
import { Segmented } from "./ui/Segmented";
import { Empty } from "./ui/Empty";
import { ChartBar, Download } from "./ui/icons";

interface ReportPageProps {
  problems: Problem[];
  methods: Method[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function toDateInput(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function deltaLabel(v: number | null): string {
  if (v === null) return "—";
  return v > 0 ? `+${v}%` : `${v}%`;
}

function Bar({
  value,
  max,
  color,
  height = 8,
}: {
  value: number;
  max: number;
  color: string;
  height?: number;
}) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="bar-track">
      <div
        className="bar-fill"
        style={{ width: `${w}%`, background: color, height }}
      />
    </div>
  );
}

export function ReportPage({ problems, methods }: ReportPageProps) {
  const [range, setRange] = useState<ReportRange>("month");
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    let alive = true;
    void getEvents().then((es) => {
      if (alive) setEvents(es);
    });
    return () => {
      alive = false;
    };
  }, [problems, methods]);

  const data = useMemo(
    () => {
      let bounds: RangeBounds | undefined;
      if (range === "custom") {
        const s = new Date(`${customStart}T00:00:00`).getTime();
        const e = new Date(`${customEnd}T23:59:59`).getTime();
        if (!Number.isNaN(s) && !Number.isNaN(e) && s <= e) {
          bounds = { start: s, end: e };
        }
      }
      return buildReport(problems, methods, events, range, Date.now(), bounds);
    },
    [problems, methods, events, range, customStart, customEnd]
  );

  if (problems.length === 0) {
    return (
      <Empty
        icon={<ChartBar size={28} />}
        title="还没有数据"
        description="录入题目后，这里会生成专业的学习数据分析报告。"
      />
    );
  }

  const kpi = data.kpi;
  const maxTrend = Math.max(
    1,
    ...data.weeklyTrend.map((w) => Math.max(w.added, w.solved))
  );
  const maxHour = Math.max(1, ...data.activity.hourDist);
  const maxStuck = Math.max(1, ...data.stuckAgeBuckets.map((b) => b.count));
  const maxMastery = Math.max(1, ...data.masteryDist.map((x) => x.count));
  const maxSimplicity = Math.max(1, ...data.solutions.simplicityDist.map((x) => x.count));
  const switchCustom = () => {
    const now = Date.now();
    const d = new Date(now);
    setRange("custom");
    setCustomStart(toDateInput(new Date(d.getFullYear(), d.getMonth(), 1).getTime()));
    setCustomEnd(toDateInput(now));
  };

  return (
    <>
      <div className="page-head report-toolbar print-hide">
        <div>
          <h1 className="page-title">学习数据分析</h1>
          <p className="page-sub">专业统计报告，可按时间范围筛选，适合打印到 A4 纸。</p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Segmented
            id="report-range"
            value={range}
            options={[
              { value: "month", label: "本月" },
              { value: "90d", label: "近 90 天" },
              { value: "all", label: "全部" },
              { value: "custom", label: "自定义" },
            ]}
            onChange={(v) => {
              if (v === "custom") switchCustom();
              else setRange(v);
            }}
          />
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Download size={15} />
            打印 / 导出 PDF
          </button>
        </div>
      </div>

      {range === "custom" && (
        <div className="custom-range print-hide">
          <label>
            从
            <input
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </label>
          <label>
            到
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </label>
          {(!customStart || !customEnd || new Date(customStart).getTime() > new Date(customEnd).getTime()) && (
            <span className="custom-range-error">请选择有效的起止日期</span>
          )}
        </div>
      )}

      <div className="report-sheet">
        <header className="report-head">
          <div>
            <span className="report-section-kicker">LEARNING REPORT</span>
            <h2>学习数据分析报告</h2>
            <p className="report-range">
              时间范围：{data.range.label} · 生成于 {formatDateTime(data.generatedAt)}
            </p>
          </div>
          <div className="report-brand">难题库</div>
        </header>

        <section className="report-section">
          <span className="report-section-kicker">CORE METRICS</span>
          <h3>核心指标</h3>
          <div className="kpi-grid">
            <Kpi label="题目总数" value={String(kpi.total)} />
            <Kpi label="已解" value={String(kpi.solved)} sub={`攻克率 ${pct(kpi.solveRate)}`} />
            <Kpi label="卡住中" value={String(kpi.stuck)} />
            <Kpi label="待做" value={String(kpi.todo)} />
            <Kpi label="范围新增" value={String(kpi.addedInRange)} />
            <Kpi label="范围攻克" value={String(kpi.solvedInRange)} />
            <Kpi
              label="平均攻克用时"
              value={kpi.avgSolveHours === null ? "—" : `${kpi.avgSolveHours} 小时`}
              sub={
                kpi.longestSolveHours === null
                  ? undefined
                  : `最长 ${kpi.longestSolveHours} 小时`
              }
            />
            <Kpi
              label="回看按时完成率"
              value={
                kpi.reviewOnTimeRate === null ? "—" : pct(kpi.reviewOnTimeRate)
              }
              sub={`${kpi.reviewSolved}/${kpi.reviewTotal} 次`}
            />
          </div>
          {data.compare && (
            <div className="compare-strip">
              <span className="compare-title">对比上一期</span>
              <span>新增 {deltaLabel(data.compare.addedDeltaPct)}</span>
              <span>攻克 {deltaLabel(data.compare.solvedDeltaPct)}</span>
              <span>
                回看按时完成率{" "}
                {data.compare.reviewRateDelta === null
                  ? "—"
                  : `${data.compare.reviewRateDelta > 0 ? "+" : ""}${data.compare.reviewRateDelta} 个百分点`}
              </span>
            </div>
          )}
        </section>

        <section className="report-section">
          <span className="report-section-kicker">STATUS &amp; TRENDS</span>
          <h3>状态与趋势</h3>
          <div className="report-cols">
            <div className="report-card">
              <p className="report-card-title">当前状态分布</p>
              {data.statusDist.length === 0 ? (
                <p className="muted">暂无题目</p>
              ) : (
                <Donut data={data.statusDist.map((x) => ({ label: x.status, value: x.count }))} />
              )}
            </div>
            <div className="report-card">
              <p className="report-card-title">近 12 周：新增 vs 攻克</p>
              <div className="trend-chart">
                {data.weeklyTrend.map((w) => (
                  <div key={w.label} className="trend-col">
                    <div className="trend-bars">
                      <div
                        className="trend-bar added"
                        style={{ height: `${Math.max(3, (w.added / maxTrend) * 100)}%` }}
                        title={`新增 ${w.added}`}
                      />
                      <div
                        className="trend-bar solved"
                        style={{ height: `${Math.max(3, (w.solved / maxTrend) * 100)}%` }}
                        title={`攻克 ${w.solved}`}
                      />
                    </div>
                    <span className="trend-label">{w.label}</span>
                  </div>
                ))}
              </div>
              <div className="legend">
                <span className="legend-item">
                  <i className="dot added" />
                  新增
                </span>
                <span className="legend-item">
                  <i className="dot solved" />
                  攻克
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="report-section">
          <span className="report-section-kicker">SOLVE ANALYSIS</span>
          <h3>攻克分析</h3>
          <div className="report-cols">
            <div className="report-card">
              <p className="report-card-title">卡住滞留时间分布（当前）</p>
              {data.stuckAgeBuckets.every((b) => b.count === 0) ? (
                <p className="muted">当前没有卡住的题</p>
              ) : (
                <div className="bucket-list">
                  {data.stuckAgeBuckets.map((b) => (
                    <div key={b.label} className="bucket-row">
                      <span className="bucket-label">{b.label}</span>
                      <Bar value={b.count} max={maxStuck} color="var(--accent-2)" />
                      <span className="bucket-count">{b.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="report-card">
              <p className="report-card-title">最硬骨头（按攻克用时）</p>
              {data.topSolves.length === 0 ? (
                <p className="muted">范围内还没有完整的“卡住→解开”记录</p>
              ) : (
                <ol className="solve-list">
                  {data.topSolves.map((s) => (
                    <li key={s.problemId}>
                      <span className="solve-title">{s.title}</span>
                      <span className="solve-hours">{s.hours} 小时</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>

        <section className="report-section">
          <span className="report-section-kicker">WEAK SPOTS</span>
          <h3>薄弱点分析</h3>
          {data.weakTags.length === 0 ? (
            <p className="muted">暂无明显的薄弱标签</p>
          ) : (
            <div className="table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>标签</th>
                    <th>题目</th>
                    <th>攻克率</th>
                    <th>卡住中</th>
                    <th>平均卡住时长</th>
                    <th>平均难度</th>
                    <th>范围回看</th>
                  </tr>
                </thead>
                <tbody>
                  {data.weakTags.map((t) => (
                    <tr key={t.tag}>
                      <td className="cell-tag">{t.tag}</td>
                      <td>{t.total}</td>
                      <td className={t.solveRate < 0.6 ? "cell-warn" : ""}>
                        {pct(t.solveRate)}
                      </td>
                      <td>{t.stuckCount}</td>
                      <td>{t.avgStuckHours > 0 ? `${t.avgStuckHours} 小时` : "—"}</td>
                      <td>{t.avgDifficulty}</td>
                      <td>{t.reviewCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="report-section">
          <span className="report-section-kicker">METHODS &amp; DIFFICULTY</span>
          <h3>方法与难度</h3>
          <div className="report-cols">
            <div className="report-card">
              <p className="report-card-title">方法使用（按关联题目数）</p>
              {data.methods.length === 0 ? (
                <p className="muted">暂无方法</p>
              ) : (
                <div className="method-list">
                  {data.methods.map((m) => (
                    <div key={m.name} className="method-row">
                      <span className="method-name">{m.name}</span>
                      <span className={`badge mastery lv${m.masteryLevel ?? 0}`}>
                        {m.masteryLabel}
                      </span>
                      <span className={`method-state state-${m.autoState}`}>
                        {m.autoStateLabel}
                      </span>
                      <span className="muted">{m.linkedCount} 题</span>
                      {m.idleDays !== null && m.idleDays >= 30 && (
                        <span className="badge idle">闲置 {m.idleDays} 天</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="report-card">
              <p className="report-card-title">难度分布与攻克率</p>
              <div className="difficulty-list">
                {data.difficulty.map((d) => (
                  <div key={d.level} className="difficulty-row">
                    <span className="bucket-label">{["", "简单", "较易", "中等", "较难", "困难"][d.level]}</span>
                    <Bar
                      value={d.count}
                      max={Math.max(1, ...data.difficulty.map((x) => x.count))}
                      color="var(--accent-2)"
                    />
                    <span className="bucket-count">
                      {d.count} · {d.count ? pct(d.solveRate) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="report-section">
          <span className="report-section-kicker">MASTERY</span>
          <h3>方法掌握度</h3>
          <div className="report-cols">
            <div className="report-card">
              <p className="report-card-title">掌握度分布（{methods.length} 个方法）</p>
              <div className="mastery-dist">
                {data.masteryDist.map((x) => (
                  <div key={x.level} className="clever-row">
                    <span className="bucket-label">{x.label}</span>
                    <Bar value={x.count} max={maxMastery} color="var(--accent-2)" />
                    <span className="bucket-count">{x.count}</span>
                  </div>
                ))}
                <div className="clever-row">
                  <span className="bucket-label">未设置</span>
                  <Bar value={data.masteryUnset} max={maxMastery} color="var(--surface-2)" />
                  <span className="bucket-count">{data.masteryUnset}</span>
                </div>
              </div>
            </div>
            <div className="report-card">
              <p className="report-card-title">建议重点练习</p>
              {data.focusMethods.length === 0 ? (
                <p className="muted">暂无需要重点练习的方法</p>
              ) : (
                <div className="method-list">
                  {data.focusMethods.map((m) => (
                    <div key={m.name} className="method-row">
                      <span className="method-name">{m.name}</span>
                      <span className={`badge mastery lv${m.masteryLevel ?? 0}`}>
                        {m.levelLabel}
                      </span>
                      <span className="method-state state-rusty">{m.autoStateLabel}</span>
                      <span className="muted">{m.linkedCount} 题</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="report-section">
          <span className="report-section-kicker">SOLUTIONS</span>
          <h3>解法分析</h3>
          <div className="report-cols">
            <div className="report-card">
              <p className="report-card-title">解法简易度分布（共 {data.solutions.total} 组解法）</p>
              {data.solutions.total === 0 ? (
                <p className="muted">暂无解法</p>
              ) : (
                <div className="mastery-dist">
                  {data.solutions.simplicityDist.map((x) => (
                    <div key={x.level} className="clever-row">
                      <span className="bucket-label">{x.label}</span>
                      <Bar value={x.count} max={maxSimplicity} color="var(--accent-2)" />
                      <span className="bucket-count">{x.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="report-card">
              <p className="report-card-title">妙解占比</p>
              <div className="clever-big">
                <span className="clever-big-value">{data.solutions.cleverCount}</span>
                <span className="clever-big-label">组妙解 · {pct(data.solutions.cleverRate)}</span>
              </div>
              <p className="muted" style={{ fontSize: 12.5 }}>
                共收录 {data.solutions.total} 组解法，标为「妙解」的解法值得反复品味。
              </p>
            </div>
          </div>
        </section>

        <section className="report-section">
          <span className="report-section-kicker">CLEVERNESS &amp; ACTIVITY</span>
          <h3>巧思与活跃度</h3>
          <div className="report-cols">
            <div className="report-card">
              <p className="report-card-title">巧思分布（共 {kpi.cleverCount} 条）</p>
              <div className="clever-dist">
                {data.cleverDist.map((c) => (
                  <div key={c.level} className="clever-row">
                    <span className="clever-level-label">{["", "一般", "巧妙", "很妙", "极妙", "绝妙"][c.level]}</span>
                    <Bar
                      value={c.count}
                      max={Math.max(1, ...data.cleverDist.map((x) => x.count))}
                      color="var(--orange)"
                    />
                    <span className="bucket-count">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="report-card">
              <p className="report-card-title">
                活跃时段 · 范围活跃 {data.activity.activeDays} 天
              </p>
              <div className="hour-chart">
                {data.activity.hourDist.map((n, h) => (
                  <div key={h} className="hour-col">
                    <div
                      className="hour-bar"
                      style={{ height: `${Math.max(4, (n / maxHour) * 100)}%` }}
                      title={`${h}:00 – ${n} 次`}
                    />
                    {h % 4 === 0 && <span className="hour-label">{h}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <footer className="report-foot">
          <p>{data.note}</p>
          <p className="muted">数据仅保存在本机浏览器中，报告本地生成，不经过任何服务器。</p>
        </footer>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

const DONUT_COLORS = ["var(--green)", "var(--red)", "var(--surface-2)"] as const;

function Donut({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((n, d) => n + d.value, 0);
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" className="donut">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        {total > 0 &&
          data.map((d, i) => {
            const len = (d.value / total) * C;
            const el = (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth="12"
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 50 50)"
              />
            );
            offset += len;
            return el;
          })}
        <text x="50" y="48" textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x="50" y="62" textAnchor="middle" className="donut-label">
          全部题目
        </text>
      </svg>
      <div className="donut-legend">
        {data.map((d, i) => (
          <span key={d.label} className="legend-item">
            <i className="dot" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            {d.label} {d.value}
          </span>
        ))}
      </div>
    </div>
  );
}
