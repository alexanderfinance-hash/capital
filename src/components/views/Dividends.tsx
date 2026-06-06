"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Icon } from "../Icon";
import { Topbar } from "../ui";
import { AddDividendModal } from "../AddDividendModal";

export default function Dividends() {
  const { store } = useApp();
  const [modal, setModal] = useState(false);
  const list = store.dividendsList;
  const ytd = list.reduce((s, d) => s + d.amount, 0);
  const maxA = Math.max(...list.map((d) => d.amount));

  return (
    <>
      <Topbar
        title="Дивиденды"
        sub="Вносятся вручную"
        right={
          <button className="btn primary" onClick={() => setModal(true)}>
            + Добавить выплату
          </button>
        }
      />

      <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
        <div className="card" style={{ padding: "8px 22px" }}>
          <div className="k" style={{ padding: "14px 0 4px" }}>
            Выплаты в этом году
          </div>
          {list.map((d, i) => (
            <div className="mlist-row" key={i}>
              <div className="tile">
                <Icon name="divid" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div>
                <div className="k" style={{ fontSize: 9, marginTop: 3 }}>
                  {d.date} · 2025
                </div>
              </div>
              <span className="mono" style={{ fontSize: 15, fontWeight: 500, color: "var(--pos)" }}>
                +{fmt(d.amount)}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <div className="k">Получено за год (YTD)</div>
            <div className="mono" style={{ fontSize: 38, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6 }}>
              {fmt(ytd)}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 150, marginTop: 18 }}>
              {[...list].reverse().map((d, i) => (
                <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div title={d.name} style={{ width: "70%", maxWidth: 38, height: `${((d.amount / maxA) * 140).toFixed(0)}px`, background: "var(--pos)", opacity: 0.8, borderRadius: "4px 4px 0 0" }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {modal && <AddDividendModal onClose={() => setModal(false)} />}
    </>
  );
}
