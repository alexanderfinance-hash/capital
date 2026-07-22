"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { PERIODS } from "@/lib/mockData";
import { fmt } from "@/lib/format";
import { LineChart, Chip, Donut, ChartEmpty, seriesForPeriod } from "@/lib/chart";
import { Topbar, ThemeButton, RefreshButton, PeriodSeg } from "../ui";
import { CatCard, AddAssetCard } from "../cards";
import { AddAssetModal } from "../AddAssetModal";

export default function Overview() {
  const { store, personalTotal, refreshPersonal, personalSyncing, capitalHistory } = useApp();
  const [period, setPeriod] = useState("6М");
  const [modal, setModal] = useState(false);
  const c = seriesForPeriod(capitalHistory, period);

  return (
    <>
      <Topbar
        title="Обзор"
        sub="Среда, 5 июня 2025"
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
              <div className="k">Общий капитал</div>
              <div className="mono" style={{ fontSize: 40, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1 }}>
                {fmt(personalTotal)}
              </div>
            </div>
            {!c.empty && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 4 }}>
                <Chip d={c.deltaPct} />
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {(c.deltaAbs >= 0 ? "+" : "−") + fmt(Math.abs(c.deltaAbs))} за период
                </span>
              </div>
            )}
          </div>
          {c.empty ? <ChartEmpty /> : <LineChart vals={c.vals} labels={c.labels} tip={c.points} />}
        </div>

        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
          <div className="k" style={{ marginBottom: 4 }}>
            Состав капитала
          </div>
          <Donut assets={store.assets} />
        </div>
      </div>

      <div className="grid-4col" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {store.assets.map((a) => (
          <CatCard key={a.id} a={a} />
        ))}
        <AddAssetCard onClick={() => setModal(true)} />
      </div>

      {modal && <AddAssetModal onClose={() => setModal(false)} />}
    </>
  );
}
