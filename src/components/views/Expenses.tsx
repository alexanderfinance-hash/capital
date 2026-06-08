"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Chip, Badge } from "@/lib/chart";
import { Topbar } from "../ui";

export default function Expenses() {
  const { store } = useApp();
  const months = store.expenseMonths;
  const lastIdx = months.length - 1;
  const [selIdx, setSelIdx] = useState(lastIdx);
  const idx = Math.min(selIdx, lastIdx);

  const maxM = Math.max(1, ...months.map((x) => x.v));
  const sel = months[idx];
  const period = sel?.period ?? "";
  const cats = (period && store.expensesByPeriod[period]) || store.expenseCats;
  const maxC = Math.max(1, ...cats.map((c) => c.value));
  const subs = (period && store.expenseSubs[period]) || {};
  const [openCat, setOpenCat] = useState<string | null>(null);

  const value = sel?.v ?? 0;
  const prev = idx > 0 ? months[idx - 1].v : value;
  const delta = prev ? Math.round(((value - prev) / prev) * 100) : 0;

  return (
    <>
      <Topbar title="Расходы" sub="Импорт из Google Sheets" right={<Badge src="sheets" />} />

      {months.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          Нет данных о расходах. Они подтянутся из Google Sheets при синхронизации.
        </div>
      ) : (
        <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div className="k">Расходы за {sel?.m?.toLowerCase()}</div>
                <div className="mono" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1 }}>
                  {fmt(value)}
                </div>
              </div>
              <div style={{ paddingBottom: 4 }}>
                <Chip d={delta} goodOverride /> <span style={{ fontSize: 12, color: "var(--muted)" }}>к прошлому мес.</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 180 }}>
              {months.map((x, i) => (
                <button
                  key={x.period ?? x.m}
                  onClick={() => setSelIdx(i)}
                  title={`${x.m}: ${fmt(x.v)}`}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, justifyContent: "flex-end", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "var(--sans)" }}
                >
                  <div
                    style={{
                      width: "60%",
                      maxWidth: 34,
                      height: `${((x.v / maxM) * 150).toFixed(0)}px`,
                      background: i === idx ? "var(--neg)" : "var(--hair)",
                      borderRadius: "4px 4px 0 0",
                      transition: "background .12s",
                    }}
                  />
                  <span className="axis" style={{ fontFamily: "var(--mono)", fontSize: 10, color: i === idx ? "var(--ink)" : "var(--muted)", fontWeight: i === idx ? 600 : 400 }}>
                    {x.m}
                  </span>
                </button>
              ))}
            </div>
            <div className="h-sub" style={{ marginTop: 12 }}>
              Нажмите на столбец месяца, чтобы посмотреть его категории.
            </div>
          </div>

          <div className="card" style={{ padding: 24 }}>
            <div className="k" style={{ marginBottom: 8 }}>
              Категории за {sel?.m?.toLowerCase()}
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
