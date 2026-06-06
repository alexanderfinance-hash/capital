"use client";

import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Chip, Badge } from "@/lib/chart";
import { Topbar, BarRow } from "../ui";

export default function Expenses() {
  const { store } = useApp();
  const f = store.flows.expenses;
  const maxM = Math.max(...store.expenseMonths.map((x) => x.v));
  const maxC = Math.max(...store.expenseCats.map((x) => x.value));
  const lastMonth = store.expenseMonths[store.expenseMonths.length - 1]?.m ?? "";

  return (
    <>
      <Topbar title="Расходы" sub="Импорт из Google Sheets" right={<Badge src="sheets" />} />

      <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <div className="k">Расходы за {lastMonth.toLowerCase()}</div>
              <div className="mono" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1 }}>
                {fmt(f.value)}
              </div>
            </div>
            <div style={{ paddingBottom: 4 }}>
              <Chip d={f.delta} goodOverride /> <span style={{ fontSize: 12, color: "var(--muted)" }}>к прошлому мес.</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 180 }}>
            {store.expenseMonths.map((x, i) => (
              <div key={x.m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, justifyContent: "flex-end" }}>
                <div
                  style={{
                    width: "60%",
                    maxWidth: 34,
                    height: `${((x.v / maxM) * 150).toFixed(0)}px`,
                    background: i === store.expenseMonths.length - 1 ? "var(--neg)" : "var(--hair)",
                    borderRadius: "4px 4px 0 0",
                  }}
                />
                <span className="axis" style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>
                  {x.m}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="k" style={{ marginBottom: 8 }}>
            Категории за месяц
          </div>
          {store.expenseCats.map((cat) => (
            <BarRow key={cat.name} label={cat.name} val={fmt(cat.value)} frac={cat.value / maxC} color="var(--neg)" />
          ))}
        </div>
      </div>
    </>
  );
}
