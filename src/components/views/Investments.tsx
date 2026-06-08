"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { PERIODS } from "@/lib/mockData";
import { fmt, fmtAmount } from "@/lib/format";
import { LineChart, Chip, Badge, ChartEmpty, seriesForPeriod } from "@/lib/chart";
import { Icon } from "../Icon";
import { Topbar, ThemeButton, RefreshButton, PeriodSeg, BarRow, SyncStamp } from "../ui";
import { AddPersonalWalletModal } from "../AddPersonalWalletModal";

const CHAIN_LABEL: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", TRX: "Tron", TON: "TON" };

export default function Investments() {
  const { store, refreshPersonal, personalSyncing, personalWallets, deletePersonalWallet, toast, cryptoHistory } = useApp();
  const [period, setPeriod] = useState("6М");
  const [openSym, setOpenSym] = useState<string | null>(null);
  const [walletModal, setWalletModal] = useState(false);
  const c = seriesForPeriod(cryptoHistory, period);
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 4 }}>
              {!c.empty && <Chip d={c.deltaPct} />}
              <Badge src="sync" />
            </div>
          </div>
          {c.empty ? <ChartEmpty /> : <LineChart vals={c.vals} labels={c.labels} />}
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
        {cr.length === 0 && (
          <div className="h-sub" style={{ padding: "12px 0 18px" }}>
            Нет крипто-холдингов. Балансы появятся после синхронизации (кнопка обновления вверху).
          </div>
        )}
        {cr.map((a) => {
          const sym = a.symbol || "";
          const subWallets = store.cryptoWallets.filter((w) => w.symbol === sym).sort((x, y) => y.usd - x.usd);
          const open = openSym === sym;
          return (
            <div key={a.id} style={{ borderBottom: "1px solid var(--hair-2)" }}>
              <button
                onClick={() => subWallets.length && setOpenSym(open ? null : sym)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 0", background: "none", border: "none", cursor: subWallets.length ? "pointer" : "default", fontFamily: "var(--sans)", textAlign: "left" }}
              >
                <div className="tile">
                  <Icon name={a.icon} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, fontWeight: 500 }}>
                    {a.name}
                    {subWallets.length > 0 && (
                      <span style={{ color: "var(--faint)", transition: "transform .15s", transform: `rotate(${open ? 90 : 0}deg)`, fontSize: 14 }}>›</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                    <Badge src={a.src} />
                    {a.amount != null && a.symbol && (
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {fmtAmount(a.amount)} {a.symbol} · {subWallets.length} кош.
                      </span>
                    )}
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
              </button>
              {open && (
                <div style={{ padding: "2px 0 12px 48px" }}>
                  {subWallets.map((w, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--hair-2)" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="badge" style={{ flex: "none", padding: "1px 6px", fontSize: 8.5 }}>{CHAIN_LABEL[w.chain] || w.chain}</span>
                          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{w.label}</span>
                        </div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>
                          {w.address.length > 16 ? `${w.address.slice(0, 8)}…${w.address.slice(-6)}` : w.address}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>
                          {fmtAmount(w.amount)} {w.symbol}
                        </div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                          {fmt(w.usd)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: "8px 22px", marginTop: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 8px" }}>
          <span className="k">Отслеживаемые адреса</span>
          <button className="btn primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setWalletModal(true)}>
            + Добавить адрес
          </button>
        </div>
        {personalWallets.length === 0 && (
          <div className="h-sub" style={{ padding: "8px 0 16px" }}>Адресов нет. Нажмите «+ Добавить адрес» (укажите сеть и адрес — баланс подтянется сразу).</div>
        )}
        {personalWallets.map((w) => (
          <div className="mlist-row" key={w.id}>
            <span className="badge" style={{ flex: "none" }}>{CHAIN_LABEL[w.chain] || w.chain}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{w.label}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {w.address}
              </div>
            </div>
            <div style={{ textAlign: "right", flex: "none" }}>
              <div className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{fmt(w.balanceUsd)}</div>
              <SyncStamp synced={w.synced} staleDays={w.staleDays} />
            </div>
            <button
              title="Удалить адрес"
              onClick={() => { deletePersonalWallet(w.id); toast(`Адрес удалён: ${w.label}`); }}
              style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4, display: "grid", placeItems: "center" }}
            >
              <Icon name="close" style={{ width: 16, height: 16 }} />
            </button>
          </div>
        ))}
      </div>

      {walletModal && <AddPersonalWalletModal onClose={() => setWalletModal(false)} />}
    </>
  );
}
