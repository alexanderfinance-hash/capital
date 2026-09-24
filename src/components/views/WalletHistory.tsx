"use client";

import { useApp } from "@/lib/store";
import { fmt, fmtAmount } from "@/lib/format";
import { Topbar } from "../ui";

const CHAIN_LABEL: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", BSC: "BNB Chain", TRX: "Tron", TON: "TON" };

/* Отдельная страница: журнал движений по кошелькам (что добавлено/выведено по дням). */
export default function WalletHistory() {
  const { store } = useApp();

  return (
    <>
      <Topbar title="Движения по кошелькам" sub="История притоков и оттоков по адресам и монетам" />

      <div className="card" style={{ padding: "8px 22px" }}>
        <div className="h-sub" style={{ padding: "14px 0 8px" }}>
          По дням: что добавлено (+) или выведено (−) по каждому адресу и монете. История копится с момента запуска функции — движения до неё восстановить нельзя.
        </div>
        {store.walletHistory.length === 0 ? (
          <div className="h-sub" style={{ padding: "4px 0 16px" }}>Пока пусто — записи появятся, когда балансы кошельков начнут меняться (обычно на следующий день).</div>
        ) : (
          store.walletHistory.map((day) => (
            <div key={day.iso} style={{ padding: "10px 0", borderTop: "1px solid var(--hair-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{day.date}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: day.netUsd >= 0 ? "var(--pos)" : "var(--neg)" }}>
                  {(day.netUsd >= 0 ? "+" : "−") + fmt(Math.abs(day.netUsd))}
                </span>
              </div>
              {day.movements.map((m, i) => {
                const pos = m.deltaAmount >= 0;
                const col = pos ? "var(--pos)" : "var(--neg)";
                return (
                  <div className="mlist-row" key={i}>
                    <span className="badge" style={{ flex: "none" }}>{CHAIN_LABEL[m.chain] || m.chain}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: col }}>
                        {(pos ? "+" : "−") + fmtAmount(Math.abs(m.deltaAmount))} {m.symbol}
                      </div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.label} · {m.address}
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 500, color: col, flex: "none" }}>
                      {(pos ? "+" : "−") + fmt(Math.abs(m.deltaUsd))}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </>
  );
}
