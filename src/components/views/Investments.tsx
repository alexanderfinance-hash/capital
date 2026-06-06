"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { CHARTS, PERIODS } from "@/lib/mockData";
import { fmt } from "@/lib/format";
import { LineChart, Chip, Badge } from "@/lib/chart";
import { Icon } from "../Icon";
import { Topbar, ThemeButton, RefreshButton, PeriodSeg, BarRow } from "../ui";

export default function Investments() {
  const { store, refreshPersonal, personalSyncing } = useApp();
  const [period, setPeriod] = useState("6М");
  const c = CHARTS[period];
  const cr = store.assets.filter((a) => a.bucket === "crypto");
  const crTotal = cr.reduce((s, a) => s + a.value, 0);

  return (
    <>
      <Topbar
        title="Инвестиции"
        sub="Криптопортфель · цены обновляются автоматически"
        right={
          <>
            <ThemeButton />
            <RefreshButton onClick={refreshPersonal} spinning={personalSyncing} />
            <PeriodSeg periods={PERIODS} active={period} onChange={setPeriod} />
          </>
        }
      />

      <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
            <div>
              <div className="k">Стоимость портфеля</div>
              <div className="mono" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1 }}>
                {fmt(crTotal)}
              </div>
            </div>
            <div style={{ paddingBottom: 4 }}>
              <Badge src="sync" />
            </div>
          </div>
          <LineChart vals={c.v} labels={c.l} />
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="k" style={{ marginBottom: 10 }}>
            Аллокация по монетам
          </div>
          {store.coins.map((coin) => (
            <BarRow key={coin.t} label={coin.t} val={coin.pct + "%"} frac={coin.pct / 100} />
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: "8px 22px" }}>
        <div className="k" style={{ padding: "14px 0 4px" }}>
          Холдинги
        </div>
        {cr.map((a) => (
          <div className="mlist-row" key={a.id}>
            <div className="tile">
              <Icon name={a.icon} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.name}</div>
              <div style={{ marginTop: 3 }}>
                <Badge src={a.src} />
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontSize: 15, fontWeight: 500 }}>
                {fmt(a.value)}
              </div>
              <div style={{ marginTop: 2 }}>
                <Chip d={a.delta} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
