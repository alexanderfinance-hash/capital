"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Chip, Badge } from "@/lib/chart";
import { Topbar } from "../ui";

/** Signed money label, e.g. "+$4,210" / "−$1,300". */
const fmtSigned = (n: number): string => (n >= 0 ? "+" : "−") + fmt(Math.abs(n));

type SeriesKey = "income" | "expenses" | "diff";

export default function Expenses() {
  const { store } = useApp();
  const months = store.expenseMonths;
  const lastIdx = months.length - 1;
  const [selIdx, setSelIdx] = useState(lastIdx);
  const idx = Math.min(selIdx, lastIdx);
  const [show, setShow] = useState<Record<SeriesKey, boolean>>({ income: true, expenses: true, diff: true });
  const toggle = (k: SeriesKey) => setShow((p) => ({ ...p, [k]: !p[k] }));

  const sel = months[idx];
  const period = sel?.period ?? "";
  const cats = (period && store.expensesByPeriod[period]) || store.expenseCats;
  const maxC = Math.max(1, ...cats.map((c) => c.value));
  const subs = (period && store.expenseSubs[period]) || {};
  const [openCat, setOpenCat] = useState<string | null>(null);

  const expVal = sel?.v ?? 0;
  const incVal = sel?.income ?? 0;
  const diffVal = incVal - expVal;
  const hasIncome = months.some((m) => (m.income ?? 0) > 0);

  // Bar scale spans whichever value-series are enabled (income + expenses).
  const scaleVals: number[] = [];
  months.forEach((m) => {
    if (show.expenses) scaleVals.push(m.v);
    if (show.income) scaleVals.push(m.income ?? 0);
  });
  const maxM = Math.max(1, ...scaleVals);

  const SERIES: { key: SeriesKey; label: string; color: string }[] = [
    { key: "income", label: "Доходы", color: "var(--pos)" },
    { key: "expenses", label: "Расходы", color: "var(--neg)" },
    { key: "diff", label: "Разница", color: "var(--ink-2)" },
  ];

  const stats = [
    { key: "income" as SeriesKey, label: "Доходы", value: incVal, color: "var(--pos)", signed: false },
    { key: "expenses" as SeriesKey, label: "Расходы", value: expVal, color: "var(--neg)", signed: false },
    { key: "diff" as SeriesKey, label: "Разница", value: diffVal, color: diffVal >= 0 ? "var(--pos)" : "var(--neg)", signed: true },
  ].filter((s) => show[s.key]);

  return (
    <>
      <Topbar title="Расходы и доходы" sub="Импорт из Google Sheets" right={<Badge src="sheets" />} />

      {months.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          Нет данных. Расходы подтянутся из Google Sheets, доходы — из ДДС (дивиденды) при синхронизации.
        </div>
      ) : (
        <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                {stats.map((s) => (
                  <div key={s.key}>
                    <div className="k">
                      {s.label} за {sel?.m?.toLowerCase()}
                    </div>
                    <div className="mono" style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-.02em", marginTop: 6, lineHeight: 1, color: s.color }}>
                      {s.signed ? fmtSigned(s.value) : fmt(s.value)}
                    </div>
                  </div>
                ))}
              </div>
              {/* Series toggles */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {SERIES.map((s) => {
                  const on = show[s.key];
                  const disabled = s.key === "income" && !hasIncome;
                  return (
                    <button
                      key={s.key}
                      onClick={() => toggle(s.key)}
                      title={disabled ? "Доходы появятся после синхронизации ДДС" : undefined}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "5px 11px",
                        borderRadius: 999,
                        border: "1px solid var(--hair)",
                        background: on ? "var(--hair-2)" : "transparent",
                        cursor: "pointer",
                        fontFamily: "var(--sans)",
                        fontSize: 12,
                        color: on ? "var(--ink)" : "var(--faint)",
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, opacity: on ? 1 : 0.35 }} />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 200 }}>
              {months.map((x, i) => {
                const xi = x.income ?? 0;
                const net = xi - x.v;
                const here = i === idx;
                return (
                  <button
                    key={x.period ?? x.m}
                    onClick={() => setSelIdx(i)}
                    title={`${x.m}: расходы ${fmt(x.v)}${xi ? ` · доходы ${fmt(xi)}` : ""}`}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, justifyContent: "flex-end", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--sans)" }}
                  >
                    {show.diff && (show.income || show.expenses) && (
                      <span className="mono" style={{ fontSize: 9.5, fontWeight: 600, color: net >= 0 ? "var(--pos)" : "var(--neg)", opacity: here ? 1 : 0.6 }}>
                        {fmtSigned(net)}
                      </span>
                    )}
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 150, width: "100%", justifyContent: "center" }}>
                      {show.income && (
                        <div
                          title={`Доходы ${fmt(xi)}`}
                          style={{ width: show.expenses ? "30%" : "46%", maxWidth: 22, height: `${((xi / maxM) * 150).toFixed(0)}px`, background: "var(--pos)", borderRadius: "4px 4px 0 0", opacity: here ? 0.95 : 0.4, transition: "opacity .12s" }}
                        />
                      )}
                      {show.expenses && (
                        <div
                          title={`Расходы ${fmt(x.v)}`}
                          style={{ width: show.income ? "30%" : "46%", maxWidth: 22, height: `${((x.v / maxM) * 150).toFixed(0)}px`, background: "var(--neg)", borderRadius: "4px 4px 0 0", opacity: here ? 0.95 : 0.4, transition: "opacity .12s" }}
                        />
                      )}
                    </div>
                    <span className="axis" style={{ fontFamily: "var(--mono)", fontSize: 10, color: here ? "var(--ink)" : "var(--muted)", fontWeight: here ? 600 : 400 }}>
                      {x.m}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="h-sub" style={{ marginTop: 12 }}>
              {hasIncome
                ? "Зелёный — доходы (дивиденды из ДДС), красный — расходы. Нажмите на месяц, чтобы увидеть его категории."
                : "Нажмите на столбец месяца, чтобы посмотреть его категории. Доходы появятся после синхронизации ДДС."}
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="k" style={{ marginBottom: 8 }}>
              Категории расходов за {sel?.m?.toLowerCase()}
            </div>
            {cats.length === 0 ? (
              <div className="h-sub">Нет категорий за этот месяц.</div>
            ) : (
              cats.map((cat) => {
                const sub = (subs[cat.name] || []).slice().sort((a, b) => b.value - a.value);
                const open = openCat === cat.name;
                const maxS = Math.max(1, ...sub.map((s) => s.value));
                return (
                  <div key={cat.name}>
                    <button
                      onClick={() => sub.length && setOpenCat(open ? null : cat.name)}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "9px 0", background: "none", border: "none", cursor: sub.length ? "pointer" : "default", fontFamily: "var(--sans)", textAlign: "left" }}
                    >
                      <span style={{ flex: "none", width: 12, color: "var(--faint)", fontSize: 13, transition: "transform .15s", transform: `rotate(${open ? 90 : 0}deg)`, opacity: sub.length ? 1 : 0 }}>›</span>
                      <span style={{ flex: 1, fontSize: 12.5, color: "var(--ink-2)" }}>{cat.name}</span>
                      <div style={{ flex: "none", width: 70, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${((cat.value / maxC) * 100).toFixed(0)}%`, background: "var(--neg)", borderRadius: 5 }} />
                      </div>
                      <span className="mono" style={{ flex: "none", width: 64, textAlign: "right", fontSize: 12.5, fontWeight: 500 }}>
                        {fmt(cat.value)}
                      </span>
                    </button>
                    {open && (
                      <div style={{ padding: "0 0 8px 24px" }}>
                        {sub.map((s) => (
                          <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                            <span style={{ flex: 1, fontSize: 11.5, color: "var(--muted)" }}>{s.name}</span>
                            <div style={{ flex: "none", width: 50, height: 6, borderRadius: 4, background: "var(--hair-2)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${((s.value / maxS) * 100).toFixed(0)}%`, background: "var(--neg)", opacity: 0.6, borderRadius: 4 }} />
                            </div>
                            <span className="mono" style={{ flex: "none", width: 58, textAlign: "right", fontSize: 11.5, color: "var(--ink-2)" }}>
                              {fmt(s.value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
