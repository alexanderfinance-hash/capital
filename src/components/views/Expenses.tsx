"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Chip, Badge } from "@/lib/chart";
import { Topbar, BarRow } from "../ui";

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
              cats.map((cat) => <BarRow key={cat.name} label={cat.name} val={fmt(cat.value)} frac={cat.value / maxC} color="var(--neg)" />)
            )}
          </div>
        </div>
      )}
    </>
  );
}
