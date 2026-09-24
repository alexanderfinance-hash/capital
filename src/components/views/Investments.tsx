"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { PERIODS } from "@/lib/mockData";
import { fmt, fmtAmount, fmtTonNumbers, fmtRub } from "@/lib/format";
import { LineChart, Chip, Badge, ChartEmpty, seriesForPeriod, combineCoinSeries } from "@/lib/chart";
import { Icon } from "../Icon";
import { Topbar, ThemeButton, RefreshButton, PeriodSeg, BarRow, SyncStamp } from "../ui";
import { AddPersonalWalletModal } from "../AddPersonalWalletModal";
import type { CoinSeries } from "@/lib/types";

const CHAIN_LABEL: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum", BSC: "BNB Chain", TRX: "Tron", TON: "TON" };

/* График по монетам: выбор одной или нескольких позиций (крипта + TON-номера) →
   суммарная линия стоимости за выбранный период. История копится с запуска фичи. */
function CoinChartCard({ coinSeries, period }: { coinSeries: CoinSeries[]; period: string }) {
  const [sel, setSel] = useState<string[]>(() => coinSeries.map((s) => s.symbol));
  const toggle = (sym: string) => setSel((p) => (p.includes(sym) ? p.filter((x) => x !== sym) : [...p, sym]));
  const allOn = coinSeries.length > 0 && sel.length === coinSeries.length;
  const selected = coinSeries.filter((s) => sel.includes(s.symbol));
  const combined = combineCoinSeries(selected);
  const cc = seriesForPeriod(combined, period);
  const total = combined.length ? combined[combined.length - 1].value : 0;

  return (
    <div className="card" style={{ padding: 24, marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <div className="k">График по монетам</div>
          <div className="h-sub" style={{ marginTop: 4 }}>
            Выберите одну монету или несколько — покажем их суммарную стоимость. История по монетам копится с запуска функции.
          </div>
        </div>
        {selected.length > 0 && (
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 500 }}>{fmt(total)}</div>
            {!cc.empty && (
              <div style={{ marginTop: 2 }}>
                <Chip d={cc.deltaPct} />
              </div>
            )}
          </div>
        )}
      </div>

      {coinSeries.length === 0 ? (
        <div className="h-sub" style={{ padding: "8px 0 16px" }}>
          Пока нет данных по монетам — ряды появятся после ближайших синхронизаций (обычно на следующий день).
        </div>
      ) : (
        <>
          <div className="seg-cat" style={{ marginBottom: 16 }}>
            <button className={allOn ? "on" : ""} onClick={() => setSel(allOn ? [] : coinSeries.map((s) => s.symbol))}>
              {allOn ? "Снять все" : "Выбрать все"}
            </button>
            {coinSeries.map((s) => (
              <button key={s.symbol} className={sel.includes(s.symbol) ? "on" : ""} onClick={() => toggle(s.symbol)}>
                {s.name}
              </button>
            ))}
          </div>
          {selected.length === 0 ? (
            <div className="h-sub" style={{ padding: "24px 0", textAlign: "center" }}>Выберите монету, чтобы увидеть график.</div>
          ) : cc.empty ? (
            <ChartEmpty />
          ) : (
            <LineChart vals={cc.vals} labels={cc.labels} tip={cc.points} />
          )}
        </>
      )}
    </div>
  );
}

export default function Investments() {
  const { store, refreshPersonal, personalSyncing, personalWallets, deletePersonalWallet, toast, cryptoHistory, coinSeries, tonNumberRate } = useApp();
  const [period, setPeriod] = useState("6М");
  const [openSym, setOpenSym] = useState<string | null>(null);
  const [walletModal, setWalletModal] = useState(false);
  // Линия стоимости портфеля = суммарная посуточная стоимость по всем монетам +
  // TON-номера (тот же источник, что «Выбрать все» → без ступеньки от подмешивания
  // номеров задним числом). Фолбэк на cryptoHistory, если рядов ещё нет.
  const c = seriesForPeriod(coinSeries.length ? combineCoinSeries(coinSeries) : cryptoHistory, period);
  const cr = store.assets.filter((a) => a.bucket === "crypto");
  const crTotal = cr.reduce((s, a) => s + a.value, 0);
  // TON-номера теперь часть портфеля (по просьбе Алекса): входят в итог, аллокацию и график.
  const tonNumAssets = store.assets.filter((a) => a.symbol === "TONNUM");
  const tonNumTotal = tonNumAssets.reduce((s, a) => s + a.value, 0);
  const portfolioTotal = crTotal + tonNumTotal;
  // Аллокация по всему портфелю (крипта + TON-номера), доли — от общего итога.
  const alloc = [
    ...cr.map((a) => ({ t: a.symbol || a.name, val: a.value })),
    ...(tonNumTotal > 0 ? [{ t: "TON номера", val: tonNumTotal }] : []),
  ]
    .filter((x) => x.val > 0)
    .sort((x, y) => y.val - x.val);
  // Позиции портфеля в списке: крипта + TON-номера.
  const portfolioRows = [...cr, ...tonNumAssets];
  const other = store.otherInvestments;
  // Активы-инвестиции вне портфеля (TON-номера теперь в портфеле — исключаем из этого блока).
  const otherInv = store.assets.filter((a) => a.investment && a.bucket !== "crypto" && a.symbol !== "TONNUM");
  const otherInvTotal = otherInv.reduce((s, a) => s + a.value, 0);

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
                {fmt(portfolioTotal)}
              </div>
              {tonNumTotal > 0 && (
                <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                  крипта {fmt(crTotal)} · TON номера {fmt(tonNumTotal)}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 4 }}>
              {!c.empty && <Chip d={c.deltaPct} />}
              <Badge src="sync" />
            </div>
          </div>
          {c.empty ? <ChartEmpty /> : <LineChart vals={c.vals} labels={c.labels} tip={c.points} />}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="k" style={{ marginBottom: 10 }}>
            Аллокация по монетам
          </div>
          {alloc.map((coin) => {
            const pct = portfolioTotal ? Math.round((coin.val / portfolioTotal) * 100) : 0;
            return <BarRow key={coin.t} label={coin.t} val={pct + "%"} frac={portfolioTotal ? coin.val / portfolioTotal : 0} />;
          })}
        </div>
      </div>

      <CoinChartCard coinSeries={coinSeries} period={period} />

      <div className="card" style={{ padding: "8px 22px" }}>
        <div className="k" style={{ padding: "14px 0 4px" }}>
          Криптовалюта
        </div>
        {cr.length === 0 && (
          <div className="h-sub" style={{ padding: "12px 0 18px" }}>
            Нет крипто-холдингов. Балансы появятся после синхронизации (кнопка обновления вверху).
          </div>
        )}
        {portfolioRows.map((a) => {
          const sym = a.symbol || "";
          // TON-номера: не крипто-монета, отдельная простая строка (без под-кошельков).
          if (sym === "TONNUM") {
            return (
              <div key={a.id} style={{ borderBottom: "1px solid var(--hair-2)", display: "flex", alignItems: "center", gap: 12, padding: "13px 0" }}>
                <div className="tile">
                  <Icon name={a.icon} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.name}</div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                    {fmtTonNumbers(a.amount ?? 0)}
                    {tonNumberRate.usd > 0 ? ` · курс ${fmt(tonNumberRate.usd)}/номер` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 15, fontWeight: 500 }}>{fmt(a.value)}</div>
                  <div style={{ marginTop: 2 }}>
                    <Chip d={a.delta} />
                  </div>
                </div>
              </div>
            );
          }
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

      {otherInv.length > 0 && (
        <div className="card" style={{ padding: "8px 22px", marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 4px" }}>
            <span className="k">Другие инвестиции</span>
            <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmt(otherInvTotal)}</span>
          </div>
          <div className="h-sub" style={{ padding: "0 0 8px" }}>
            Активы вне криптопортфеля, отмеченные как инвестиции. Переключить можно на странице «Активы» (зелёная иконка).
          </div>
          {otherInv.map((a) => {
            const isTon = a.symbol === "TONNUM";
            return (
              <div className="mlist-row" key={a.id}>
                <div className="tile">
                  <Icon name={a.icon} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                    {isTon
                      ? `${fmtTonNumbers(a.amount ?? 0)}${tonNumberRate.usd > 0 ? ` · курс ${fmt(tonNumberRate.usd)}/номер` : ""}`
                      : a.currency === "RUB" && a.nativeValue != null
                      ? `${fmtRub(a.nativeValue)} · по курсу ЦБ`
                      : "вручную"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="mono" style={{ fontSize: 14, fontWeight: 500 }}>{fmt(a.value)}</div>
                  {a.delta != null && (
                    <div style={{ marginTop: 2 }}>
                      <Chip d={a.delta} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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


      {other && other.total > 0 && (
        <div className="card" style={{ padding: "8px 22px", marginTop: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 4px" }}>
            <span className="k">Прочие инвестиции</span>
            <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{fmt(other.total)}</span>
          </div>
          <div className="h-sub" style={{ padding: "0 0 10px" }}>
            Вложения в развитие (обучение и т.п.) — из отчёта расходов. Не входят в стоимость портфеля, так как их нельзя продать.
          </div>
          {other.items.map((it) => (
            <div className="mlist-row" key={it.name}>
              <div className="tile">
                <Icon name="gem" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{it.name}</div>
                <div className="k" style={{ fontSize: 9, marginTop: 3 }}>из расходов · по курсу ЦБ</div>
              </div>
              <span className="mono" style={{ fontSize: 13.5, fontWeight: 500 }}>{fmt(it.value)}</span>
            </div>
          ))}
        </div>
      )}

      {walletModal && <AddPersonalWalletModal onClose={() => setWalletModal(false)} />}
    </>
  );
}
