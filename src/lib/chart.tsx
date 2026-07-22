"use client";

import React, { useRef, useState } from "react";
import { fmt, fmtK } from "./format";
import type { Asset, HistoryPoint, SnapshotPoint } from "./types";

/* ===== Real-history series (PRD §6) ===== */
const PERIOD_DAYS: Record<string, number> = { "1Н": 7, "1М": 31, "6М": 184, "1Г": 366 };

export interface Series {
  vals: number[]; // in thousands (for LineChart)
  labels: string[]; // sparse — empty string = no tick
  points: { label: string; value: number }[]; // full per-point label + USD value (for hover tooltips)
  deltaPct: number;
  deltaAbs: number; // signed, in dollars
  empty: boolean;
}

/** Filter dated snapshots to the selected period and shape them for LineChart.
 *  No artificial stretching: shows only as much history as actually exists; if
 *  the chosen period is longer than the data, the available range is shown. */
export function seriesForPeriod(points: SnapshotPoint[], period: string): Series {
  const days = PERIOD_DAYS[period] ?? 184;
  const cutoff = Date.now() - days * 86400000;
  let pts = points.filter((p) => new Date(p.t).getTime() >= cutoff);
  // Keep at least the two most recent points so a line can always be drawn
  // once history exists, even if the period window is very short.
  if (pts.length < 2 && points.length >= 2) pts = points.slice(-2);
  if (pts.length < 2) return { vals: [], labels: [], points: [], deltaPct: 0, deltaAbs: 0, empty: true };

  const vals = pts.map((p) => p.value / 1000);
  const n = pts.length;
  // Show ~6 evenly-spaced labels (plus the last) to avoid clutter on dense data.
  const step = Math.max(1, Math.ceil(n / 6));
  const labels = pts.map((p, i) => (i % step === 0 || i === n - 1 ? p.label : ""));
  const fullPoints = pts.map((p) => ({ label: p.label, value: p.value }));

  const first = pts[0].value;
  const last = pts[n - 1].value;
  const deltaAbs = last - first;
  const deltaPct = first ? +((deltaAbs / first) * 100).toFixed(1) : 0;
  return { vals, labels, points: fullPoints, deltaPct, deltaAbs, empty: false };
}

/** Placeholder shown until enough history accumulates (PRD §6). */
export function ChartEmpty({ height = 240 }: { height?: number }) {
  return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12.5, textAlign: "center", padding: "0 24px" }}>
      График появится, когда накопится история синхронизаций.
    </div>
  );
}

/* Catmull-Rom-ish smoothing — identical to prototype's smooth(). */
function smooth(pts: number[][]): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export interface ChartOpts {
  W?: number;
  H?: number;
  padL?: number;
  bot?: number;
  ticks?: boolean;
}

/* Line/area chart — mirrors buildChart() in dashboard-content.js.
   `vals` are in thousands (axis labels use fmtK(v*1000)).
   `tip` (optional) carries the full per-point label + USD value so hovering the
   chart shows the exact figure at the cursor (Google-Sheets style). */
export function LineChart({ vals, labels, tip, o = {} }: { vals: number[]; labels?: string[]; tip?: { label: string; value: number }[]; o?: ChartOpts }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hi_, setHover] = useState<number | null>(null);
  const W = o.W || 720,
    H = o.H || 240,
    padL = o.padL != null ? o.padL : 42,
    padR = 14,
    top = 22,
    bot = o.bot || 196;
  const lo = Math.min(...vals),
    hi = Math.max(...vals),
    pad = (hi - lo || 1) * 0.18;
  const vlo = lo - pad,
    vhi = hi + pad;
  const X = (i: number) => padL + (i * (W - padL - padR)) / (vals.length - 1);
  const Y = (v: number) => top + (1 - (v - vlo) / (vhi - vlo)) * (bot - top);
  const pts = vals.map((v, i) => [+X(i).toFixed(1), +Y(v).toFixed(1)]);
  const line = smooth(pts);
  const area = line + ` L${pts[pts.length - 1][0]},${bot} L${pts[0][0]},${bot} Z`;

  const gridEls: React.ReactNode[] = [];
  if (o.ticks !== false) {
    for (let t = 0; t < 4; t++) {
      const v = vhi - pad - (t * (vhi - vlo - 2 * pad)) / 3,
        y = Y(v);
      gridEls.push(<line key={`g${t}`} className="gridline" x1={padL} y1={+y.toFixed(1)} x2={W - padR} y2={+y.toFixed(1)} />);
      gridEls.push(
        <text key={`t${t}`} className="axis" x={0} y={+(y + 3).toFixed(1)}>
          {fmtK(v * 1000)}
        </text>
      );
    }
  } else {
    [0.2, 0.55, 0.9].forEach((f, idx) => {
      const y = top + f * (bot - top);
      gridEls.push(<line key={`gl${idx}`} className="gridline" x1={0} y1={y} x2={W} y2={y} />);
    });
  }

  const xl: React.ReactNode[] = [];
  if (labels)
    labels.forEach((m, i) => {
      if (!m) return; // skip empty (sparse) labels
      xl.push(
        <text key={`x${i}`} className="axis" x={+X(i).toFixed(1)} y={bot + 24} textAnchor="middle">
          {m}
        </text>
      );
    });

  const end = pts[pts.length - 1];

  // Map the cursor to the nearest data point (viewBox-aware).
  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg || vals.length < 2) return;
    const rect = svg.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    let i = Math.round(((vx - padL) * (vals.length - 1)) / (W - padL - padR));
    i = Math.max(0, Math.min(vals.length - 1, i));
    setHover(i);
  };

  const hp = hi_ != null ? pts[hi_] : null;
  const hVal = hi_ != null ? (tip?.[hi_]?.value ?? vals[hi_] * 1000) : 0;
  const hLabel = hi_ != null ? (tip?.[hi_]?.label ?? labels?.[hi_] ?? "") : "";

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {gridEls}
        <path d={area} fill="var(--pos-fill)" />
        <path d={line} fill="none" stroke="var(--pos)" strokeWidth={2.2} />
        {hp && <line x1={hp[0]} y1={top} x2={hp[0]} y2={bot} stroke="var(--faint)" strokeWidth={1} strokeDasharray="3 3" />}
        <circle cx={end[0]} cy={end[1]} r={o.W ? 4 : 4.5} fill="var(--pos)" stroke="var(--surface)" strokeWidth={2} />
        {hp && <circle cx={hp[0]} cy={hp[1]} r={4.5} fill="var(--pos)" stroke="var(--surface)" strokeWidth={2} />}
        {xl}
      </svg>
      {hp && (
        <div
          style={{
            position: "absolute",
            left: `${(hp[0] / W) * 100}%`,
            top: `${(hp[1] / H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 10px))",
            pointerEvents: "none",
            background: "var(--ink)",
            color: "var(--surface)",
            borderRadius: 6,
            padding: "5px 9px",
            fontSize: 11.5,
            lineHeight: 1.35,
            whiteSpace: "nowrap",
            textAlign: "center",
            boxShadow: "0 4px 14px rgba(0,0,0,.18)",
            zIndex: 2,
          }}
        >
          <div className="mono" style={{ fontWeight: 600 }}>{fmt(hVal)}</div>
          {hLabel && <div style={{ opacity: 0.7, fontSize: 10 }}>{hLabel}</div>}
        </div>
      )}
    </div>
  );
}

/* Delta chip — mirrors chip(). */
export function Chip({ d, goodOverride }: { d: number | null | undefined; goodOverride?: boolean }) {
  if (d === null || d === undefined)
    return (
      <span className="mono" style={{ color: "var(--faint)", fontSize: 12 }}>
        —
      </span>
    );
  const up = d >= 0;
  const good = goodOverride !== undefined ? goodOverride : up;
  const arrow = up ? "6 14 12 8 18 14" : "6 10 12 16 18 10";
  return (
    <span className={`delta ${good ? "up" : "down"} mono`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <polyline points={arrow} />
      </svg>
      {(up ? "+" : "−") + Math.abs(d)}%
    </span>
  );
}

/* Source badge — mirrors badge(). */
export function Badge({ src }: { src: string }) {
  if (src === "sync")
    return (
      <span className="badge sync">
        <span className="dt" />
        синхрон
      </span>
    );
  if (src === "sheets")
    return (
      <span className="badge sheets">
        <span className="dt" />
        Sheets
      </span>
    );
  return (
    <span className="badge">
      <span className="dt" />
      вручную
    </span>
  );
}

/* ===== Category colour palette (expenses, etc.) =====
   Подбор устойчивых, различимых цветов в стиле дашборда. Категорий бывает много,
   поэтому палитра циклична. Цвет назначается по порядку (обычно — по убыванию
   суммы), чтобы donut и стопка-диаграмма красили одну категорию одинаково. */
export const CAT_COLORS = [
  "#16744f", // зелёный
  "#a93b34", // красный
  "#2f5c8f", // синий
  "#c98a1e", // янтарь
  "#6b4ea0", // фиолетовый
  "#3d8b8b", // бирюзовый
  "#b5603a", // терракота
  "#9a8c3a", // оливковый
  "#a23b6e", // пурпур
  "#4a8c3a", // лист
  "#5a6b8c", // сине-серый
  "#c2682f", // оранжевый
  "#8b5a8c", // лиловый
  "#3a7ca0", // океан
  "#b0903a", // золото
  "#7c818b", // серый
];

/** Назначить цвета категориям по порядку (имена лучше передавать уже
 *  отсортированными по убыванию суммы — так заметные категории получают
 *  «сильные» первые цвета). Палитра циклична. */
export function catColorMap(names: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  names.forEach((n, i) => {
    map[n] = CAT_COLORS[i % CAT_COLORS.length];
  });
  return map;
}

/* Универсальный donut по категориям — структура расходов за период.
   В центре — итог; сегменты подписаны через <title> (категория · сумма · %). */
/** Денежная сумма с «тонкими» разделителями разрядов. Моноширинный шрифт рисует
 *  любой пробел во всю ширину знакоместа, поэтому разделители групп (₽ 2 564 776)
 *  разъезжаются. Здесь мы режем строку по пробелам и вставляем узкие inline-блоки
 *  фиксированной ширины — не завися от метрик шрифта. Для USD ($2,649,472 — через
 *  запятые, без пробелов) рендерится как есть. */
export function Money({ children }: { children: string }) {
  const parts = children.split(/[\u0020\u00A0\u202F]+/);
  if (parts.length === 1) return <>{children}</>;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ display: "inline-block", width: "0.26em" }} />}
          {p}
        </React.Fragment>
      ))}
    </span>
  );
}

export function CategoryDonut({
  data,
  total,
  fmtV,
}: {
  data: { name: string; value: number; color: string }[];
  total?: number;
  fmtV: (v: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const segs = data.filter((d) => d.value > 0);
  const T = total || segs.reduce((s, d) => s + d.value, 0) || 1;
  const C = 2 * Math.PI * 52;
  let off = 0;
  const circles = segs.map((s, i) => {
    const len = (s.value / T) * C;
    const on = hover === i;
    const el = (
      <circle
        key={i}
        cx={60}
        cy={60}
        r={52}
        fill="none"
        stroke={s.color}
        strokeWidth={on ? 17 : 14}
        strokeDasharray={`${len.toFixed(1)} ${(C - len).toFixed(1)}`}
        strokeDashoffset={(-off).toFixed(1)}
        style={{ cursor: "pointer", transition: "stroke-width .1s", opacity: hover === null || on ? 1 : 0.55 }}
        onMouseEnter={() => setHover(i)}
      />
    );
    off += len;
    return el;
  });
  const onMove = (e: React.MouseEvent) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const h = hover !== null ? segs[hover] : null;
  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", margin: "2px auto 16px", width: 168 }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox="0 0 120 120" style={{ width: 168, height: 168, display: "block", margin: "0 auto", transform: "rotate(-90deg)" }}>
        {circles}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
        <span className="mono" style={{ fontSize: 17, fontWeight: 500 }}><Money>{fmtV(T)}</Money></span>
        <span className="k" style={{ fontSize: 9 }}>итого</span>
      </div>
      {h && (
        <div
          style={{
            position: "absolute",
            left: pos.x,
            top: pos.y,
            transform: "translate(-50%, calc(-100% - 12px))",
            pointerEvents: "none",
            background: "var(--ink)",
            color: "var(--surface)",
            borderRadius: 6,
            padding: "5px 9px",
            fontSize: 11.5,
            lineHeight: 1.35,
            whiteSpace: "nowrap",
            textAlign: "center",
            boxShadow: "0 4px 14px rgba(0,0,0,.18)",
            zIndex: 5,
          }}
        >
          <div className="mono" style={{ fontWeight: 600 }}><Money>{fmtV(h.value)}</Money> · {Math.round((h.value / T) * 100)}%</div>
          <div style={{ opacity: 0.75, fontSize: 10 }}>{h.name}</div>
        </div>
      )}
    </div>
  );
}

/* Capital-composition donut — mirrors renderDonut(). */
export function Donut({ assets }: { assets: Asset[] }) {
  // Пончик показывает только активы; задолженности (liability) в состав не входят.
  const shown = assets.filter((a) => !a.liability);
  const T = shown.reduce((s, a) => s + a.value, 0);
  const B: Record<string, number> = { crypto: 0, vehicles: 0, cash: 0, other: 0 };
  shown.forEach((a) => (B[a.bucket] = (B[a.bucket] || 0) + a.value));
  const segs = [
    { k: "Крипта", v: B.crypto, c: "var(--pos)" },
    { k: "Автомобили", v: B.vehicles, c: "var(--donut-2)" },
    { k: "Наличные", v: B.cash, c: "var(--donut-3)" },
    { k: "Прочее", v: B.other, c: "var(--donut-4)" },
  ].filter((s) => s.v > 0);
  const C = 2 * Math.PI * 52;
  let off = 0;
  const circles = segs.map((s, i) => {
    const len = (s.v / T) * C;
    const el = (
      <circle
        key={i}
        cx={60}
        cy={60}
        r={52}
        fill="none"
        stroke={s.c}
        strokeWidth={13}
        strokeDasharray={`${len.toFixed(1)} ${(C - len).toFixed(1)}`}
        strokeDashoffset={(-off).toFixed(1)}
      />
    );
    off += len;
    return el;
  });
  return (
    <div>
      <div style={{ position: "relative", margin: "4px 0 8px" }}>
        <svg viewBox="0 0 120 120" style={{ width: 150, height: 150, display: "block", margin: "0 auto", transform: "rotate(-90deg)" }}>
          {circles}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span className="mono" style={{ fontSize: 19, fontWeight: 500 }}>
            {fmtK(T)}
          </span>
          <span className="k" style={{ fontSize: 9 }}>
            итого
          </span>
        </div>
      </div>
      <div>
        {segs.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: "1px solid var(--hair-2)" }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.c, flex: "none" }} />
            <span style={{ flex: 1, fontSize: 12.5, color: "var(--ink-2)" }}>{s.k}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)", width: 34 }}>
              {Math.round((s.v / T) * 100)}%
            </span>
            <span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>
              {fmt(s.v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== Company chart — mirrors chartHTML(available) in dashboard-company.js ===== */
export function CompanyChart({ history, current }: { history: HistoryPoint[]; current: number }) {
  // Need at least two points to draw a line; otherwise show a placeholder.
  if (history.length < 2) {
    return (
      <div>
        <div className="k">Остатки USDT на кошельках компании</div>
        <div className="h-sub" style={{ marginTop: 4 }}>
          баланс кошельков · с 1 января
        </div>
        <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12.5 }}>
          График появится, когда накопится история синхронизаций.
        </div>
      </div>
    );
  }
  const vals = history.map((h) => h.value);
  // Last point reflects the live wallet USDT total (the rest are stored snapshots).
  vals[vals.length - 1] = current;
  const labels = history.map((h) => h.week);
  const W = 720,
    H = 240,
    padL = 46,
    padR = 14,
    top = 22,
    bot = 196;
  const lo = Math.min(...vals),
    hi = Math.max(...vals),
    pad = (hi - lo || 1) * 0.18,
    vlo = lo - pad,
    vhi = hi + pad;
  const X = (i: number) => padL + (i * (W - padL - padR)) / (vals.length - 1);
  const Y = (v: number) => top + (1 - (v - vlo) / (vhi - vlo)) * (bot - top);
  const pts = vals.map((v, i) => [+X(i).toFixed(1), +Y(v).toFixed(1)]);
  const line = smooth(pts);
  const area = line + ` L${pts[pts.length - 1][0]},${bot} L${pts[0][0]},${bot} Z`;
  const gridEls: React.ReactNode[] = [];
  for (let t = 0; t < 4; t++) {
    const v = vhi - pad - (t * (vhi - vlo - 2 * pad)) / 3,
      y = Y(v);
    gridEls.push(<line key={`g${t}`} className="gridline" x1={padL} y1={+y.toFixed(1)} x2={W - padR} y2={+y.toFixed(1)} />);
    gridEls.push(
      <text key={`t${t}`} className="axis" x={0} y={+(y + 3).toFixed(1)}>
        {fmtK(v)}
      </text>
    );
  }
  const xl: React.ReactNode[] = [];
  labels.forEach((m, i) => {
    if (i % 2 === 0 || i === labels.length - 1)
      xl.push(
        <text key={`x${i}`} className="axis" x={+X(i).toFixed(1)} y={bot + 24} textAnchor="middle">
          {m}
        </text>
      );
  });
  const end = pts[pts.length - 1];
  const delta = current - vals[0];
  const pct = vals[0] ? +((delta / vals[0]) * 100).toFixed(1) : 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div className="k">Остатки USDT на кошельках компании</div>
          <div className="h-sub" style={{ marginTop: 4 }}>
            баланс кошельков · с 1 января
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Chip d={pct} />
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
            {(delta >= 0 ? "+" : "−") + fmt(Math.abs(delta)).slice(1)} за период
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {gridEls}
        <path d={area} fill="var(--pos-fill)" />
        <path d={line} fill="none" stroke="var(--pos)" strokeWidth={2.2} />
        <circle cx={end[0]} cy={end[1]} r={4.5} fill="var(--pos)" stroke="var(--surface)" strokeWidth={2} />
        {xl}
      </svg>
    </div>
  );
}
