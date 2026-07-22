"use client";

import React from "react";
import { Icon } from "./Icon";
import { toggleTheme } from "@/lib/theme";

export function Topbar({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22 }}>
      <div>
        <h1 className="h-title">{title}</h1>
        {sub ? <p className="h-sub">{sub}</p> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{right}</div>
    </div>
  );
}

export function ThemeButton() {
  return (
    <button className="iconbtn theme-toggle" data-action="theme" title="Светлая/тёмная тема" onClick={toggleTheme}>
      <span className="i-dark">
        <Icon name="moon" />
      </span>
      <span className="i-light">
        <Icon name="sun" />
      </span>
    </button>
  );
}

export function RefreshButton({ onClick, spinning }: { onClick: () => void; spinning?: boolean }) {
  return (
    <button className={`iconbtn${spinning ? " spin" : ""}`} onClick={onClick}>
      <Icon name="refresh" />
    </button>
  );
}

export function PeriodSeg({ periods, active, onChange }: { periods: readonly string[]; active: string; onChange: (p: string) => void }) {
  return (
    <div className="seg">
      {periods.map((p) => (
        <button key={p} className={p === active ? "on" : ""} onClick={() => onChange(p)}>
          {p}
        </button>
      ))}
    </div>
  );
}

/* Freshness stamp for synced data (PRD §7): plain time when fresh, a soft
 * "устарело" badge when stale (>= 1 day), "ожидает обновления" when never synced. */
export function SyncStamp({ synced, staleDays }: { synced: string; staleDays?: number }) {
  if (staleDays === -1) {
    return <span style={{ fontSize: 10, color: "var(--muted)" }}>ожидает обновления</span>;
  }
  if (staleDays != null && staleDays >= 1) {
    return (
      <span className="badge" style={{ color: "var(--neg)", borderColor: "#e7c9c5", padding: "1px 6px", fontSize: 8.5 }} title="Данные давно не обновлялись">
        {synced}
      </span>
    );
  }
  return <span style={{ fontSize: 10, color: "var(--faint)" }}>{synced}</span>;
}

export function BarRow({ label, val, frac, color }: { label: string; val: string; frac: number; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0" }}>
      <span style={{ flex: "none", width: 96, fontSize: 12.5, color: "var(--ink-2)" }}>{label}</span>
      <div style={{ flex: 1, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${(frac * 100).toFixed(0)}%`, background: color || "var(--pos)", borderRadius: 5 }} />
      </div>
      <span className="mono" style={{ flex: "none", width: 64, textAlign: "right", fontSize: 12.5, fontWeight: 500 }}>
        {val}
      </span>
    </div>
  );
}
