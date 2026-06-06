import React from "react";
import { fmt, fmtK } from "./format";
import type { Asset, HistoryPoint } from "./types";

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
   `vals` are in thousands (axis labels use fmtK(v*1000)). */
export function LineChart({ vals, labels, o = {} }: { vals: number[]; labels?: string[]; o?: ChartOpts }) {
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
      xl.push(
        <text key={`x${i}`} className="axis" x={+X(i).toFixed(1)} y={bot + 24} textAnchor="middle">
          {m}
        </text>
      );
    });

  const end = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {gridEls}
      <path d={area} fill="var(--pos-fill)" />
      <path d={line} fill="none" stroke="var(--pos)" strokeWidth={2.2} />
      <circle cx={end[0]} cy={end[1]} r={o.W ? 4 : 4.5} fill="var(--pos)" stroke="var(--surface)" strokeWidth={2} />
      {xl}
    </svg>
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

/* Capital-composition donut — mirrors renderDonut(). */
export function Donut({ assets }: { assets: Asset[] }) {
  const T = assets.reduce((s, a) => s + a.value, 0);
  const B: Record<string, number> = { crypto: 0, vehicles: 0, cash: 0, other: 0 };
  assets.forEach((a) => (B[a.bucket] = (B[a.bucket] || 0) + a.value));
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
        <svg viewBox="0 0 120 120" style={{ width: 150, height: 150, display: "block", margin: "2px auto 0", transform: "rotate(-90deg)" }}>
          {circles}
        </svg>
        <div style={{ position: "absolute", inset: 0, bottom: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
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
export function CompanyChart({ history, available }: { history: HistoryPoint[]; available: number }) {
  const vals = history.map((h) => h.value);
  vals[vals.length - 1] = available;
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
  const delta = available - vals[0];
  const pct = +((delta / vals[0]) * 100).toFixed(1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div className="k">Динамика вывода</div>
          <div className="h-sub" style={{ marginTop: 4 }}>
            доступно к выводу · 12 недель
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
