"use client";

import React, { useEffect, useRef, useState } from "react";
import { useApp, type CompanyComputed, type CompanyLayout, type OpenGroups } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Chip, CompanyChart } from "@/lib/chart";
import { Icon } from "../Icon";
import { AddWalletModal } from "../AddWalletModal";
import { AddAgencyModal } from "../AddAgencyModal";
import type { Agency, Reserves, Wallet } from "@/lib/types";

const money = fmt;

/* ---------- waterfall ---------- */
function Waterfall({ c, tech }: { c: CompanyComputed; tech: number }) {
  const rows = [
    { label: "Кошельки USDT", value: c.walletsTotal, kind: "add" as const },
    { label: "Рекламные агентства", value: c.agenciesTotal, kind: "add" as const },
    { label: "Резерв на зарплаты", value: -c.salaryReserve, kind: "sub" as const },
    { label: "Резерв на тех. расходы", value: -tech, kind: "sub" as const },
  ];
  const scaleMax = Math.max(c.walletsTotal, c.agenciesTotal, c.salaryReserve, tech, c.available) || 1;
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
          <div style={{ flex: "none", width: 160, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)" }}>
            <span className="mono" style={{ color: r.kind === "add" ? "var(--pos)" : "var(--neg)", fontWeight: 600, width: 10 }}>
              {r.kind === "add" ? "+" : "−"}
            </span>
            {r.label}
          </div>
          <div style={{ flex: 1, height: 8, borderRadius: 5, background: "var(--hair-2)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${((Math.abs(r.value) / scaleMax) * 100).toFixed(0)}%`,
                background: r.kind === "add" ? "var(--pos)" : "var(--neg)",
                opacity: r.kind === "add" ? 1 : 0.55,
                borderRadius: 5,
              }}
            />
          </div>
          <span className="mono" style={{ flex: "none", width: 96, textAlign: "right", fontSize: 12.5, fontWeight: 500, color: r.kind === "add" ? "var(--ink)" : "var(--neg)" }}>
            {r.kind === "sub" ? "−" : ""}
            {money(Math.abs(r.value))}
          </span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0 2px", borderTop: "2px solid var(--hair)", marginTop: 6 }}>
        <div style={{ flex: "none", width: 160, fontSize: 12.5, fontWeight: 600 }}>Доступно к выводу</div>
        <div style={{ flex: 1, height: 8, borderRadius: 5, background: "var(--pos-bg)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${((c.available / scaleMax) * 100).toFixed(0)}%`, background: "var(--pos)", borderRadius: 5 }} />
        </div>
        <span className="mono" style={{ flex: "none", width: 96, textAlign: "right", fontSize: 14, fontWeight: 600, color: "var(--pos)" }}>
          {money(c.available)}
        </span>
      </div>
    </>
  );
}

/* ---------- wallet group ---------- */
function WalletGroup({ groupKey, tone, title, hint, wallets, open, onToggle, onDelete }: { groupKey: keyof OpenGroups; tone: "clean" | "dirty"; title: string; hint: string; wallets: Wallet[]; open: boolean; onToggle: () => void; onDelete: (id: string) => void }) {
  const total = wallets.reduce((s, w) => s + w.balance, 0);
  const mains = wallets.filter((w) => w.type === "main").length;
  const dot = tone === "clean" ? "var(--pos)" : "var(--muted)";
  return (
    <div style={{ borderTop: "1px solid var(--hair)" }}>
      <button onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "13px 4px", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--sans)", textAlign: "left" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flex: "none" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{title}</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
            {wallets.length} кош. · {mains} осн. · {hint}
          </div>
        </div>
        <span className="mono" style={{ fontSize: 14, fontWeight: 500 }}>
          {money(total)}
        </span>
        <span style={{ color: "var(--faint)", transition: "transform .15s", transform: `rotate(${open ? 90 : 0}deg)`, fontSize: 15 }}>›</span>
      </button>
      {open && (
        <div style={{ padding: "2px 0 6px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr auto", gap: 10, padding: "6px 4px", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 600 }}>
            <span>Кошелёк</span>
            <span>Адрес</span>
            <span style={{ textAlign: "right" }}>Баланс</span>
          </div>
          {wallets.map((w) => (
            <div key={w.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr auto", gap: 10, padding: "9px 4px", borderTop: "1px solid var(--hair-2)", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{w.label}</span>
                {w.type === "main" && (
                  <span className="badge" style={{ padding: "1px 6px", fontSize: 8.5 }}>
                    осн.
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>
                  {w.addr.slice(0, 6)}…{w.addr.slice(-4)}
                </span>
                <span style={{ fontSize: 10, color: "var(--faint)" }}>{w.synced}</span>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <span className="mono" style={{ fontSize: 13, fontWeight: 500, textAlign: "right" }}>
                  {money(w.balance)}
                </span>
                <button title="Удалить кошелёк" onClick={() => onDelete(w.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 0, display: "grid", placeItems: "center" }}>
                  <Icon name="close" style={{ width: 14, height: 14 }} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- agency amount (inline edit) ---------- */
function AgencyAmount({ a }: { a: Agency }) {
  const { editing, setEditing, setAgencyBalance } = useApp();
  const isEditing = editing === a.id;
  const [val, setVal] = useState(String(a.balance));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setVal(String(a.balance));
      requestAnimationFrame(() => {
        ref.current?.focus();
        ref.current?.select();
      });
    }
  }, [isEditing, a.balance]);

  const commit = () => {
    const n = parseInt((val || "").replace(/[^\d]/g, ""), 10);
    setAgencyBalance(a.id, isNaN(n) ? 0 : n);
    setEditing(null);
  };

  if (isEditing) {
    return (
      <input
        ref={ref}
        className="mono"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(null);
        }}
        style={{ width: 96, justifySelf: "end", textAlign: "right", fontSize: 13, fontWeight: 500, border: "1px solid var(--pos)", borderRadius: 6, padding: "4px 6px", outline: "none", background: "var(--surface)", color: "var(--ink)" }}
      />
    );
  }
  return (
    <button
      className="mono"
      onClick={() => setEditing(a.id)}
      style={{ justifySelf: "end", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink)", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--mono)" }}
    >
      {money(a.balance)}
      <span style={{ color: "var(--faint)", fontSize: 11 }}>✎</span>
    </button>
  );
}

function AgenciesGroup({ c }: { c: CompanyComputed }) {
  const { agencies, open, toggleOpen, deleteAgency } = useApp();
  const isOpen = open.agencies;
  return (
    <>
      <button onClick={() => toggleOpen("agencies")} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "13px 4px", background: "none", border: "none", borderTop: "1px solid var(--hair)", cursor: "pointer", fontFamily: "var(--sans)", textAlign: "left" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--sync)", flex: "none" }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Рекламные агентства</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{agencies.length} агентств · ручной ввод</div>
        </div>
        <span className="mono" style={{ fontSize: 14, fontWeight: 500 }}>
          {money(c.agenciesTotal)}
        </span>
        <span style={{ color: "var(--faint)", transform: `rotate(${isOpen ? 90 : 0}deg)`, fontSize: 15 }}>›</span>
      </button>
      {isOpen && (
        <div style={{ padding: "2px 0 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr auto", gap: 10, padding: "6px 4px", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--faint)", fontWeight: 600 }}>
            <span>Платформа</span>
            <span>Обновлено</span>
            <span style={{ textAlign: "right" }}>Баланс</span>
          </div>
          {agencies.map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.3fr auto", gap: 10, padding: "9px 4px", borderTop: "1px solid var(--hair-2)", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{a.platform}</span>
                <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{a.name}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {a.staleDays >= 4 ? (
                  <span className="badge" style={{ color: "var(--neg)", borderColor: "#e7c9c5", padding: "1px 6px", fontSize: 8.5 }}>
                    {a.updated}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: "var(--ink-2)" }}>{a.updated}</span>
                )}
                <span style={{ fontSize: 10, color: "var(--faint)" }}>внёс: {a.by}</span>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                <AgencyAmount a={a} />
                <button title="Удалить агентство" onClick={() => deleteAgency(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 0, display: "grid", placeItems: "center" }}>
                  <Icon name="close" style={{ width: 14, height: 14 }} />
                </button>
              </span>
            </div>
          ))}
          {agencies.length === 0 && <div style={{ fontSize: 11, color: "var(--muted)", padding: "10px 4px" }}>Агентств пока нет.</div>}
          <div style={{ fontSize: 11, color: "var(--muted)", padding: "10px 4px 4px", borderTop: "1px solid var(--hair-2)" }}>Нажмите на сумму, чтобы изменить вручную</div>
        </div>
      )}
    </>
  );
}

/* ---------- reserve sliders ---------- */
function Slider({ k, name, fig, min, max, step, note, salaryReserve }: { k: keyof Reserves; name: string; fig: string; min: number; max: number; step: number; note?: boolean; salaryReserve: number }) {
  const { reserves, setReserve } = useApp();
  return (
    <div style={note === undefined ? undefined : {}}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{name}</span>
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
          {fig}
        </span>
      </div>
      <input type="range" className="co-range" min={min} max={max} step={step} value={reserves[k]} onChange={(e) => setReserve(k, +e.target.value)} />
      {note && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
          = резерв на зарплаты{" "}
          <b className="mono">{money(salaryReserve)}</b>
        </div>
      )}
    </div>
  );
}

function ReservesSliders({ c, compact }: { c: CompanyComputed; compact: boolean }) {
  const { reserves } = useApp();
  const items = (
    <>
      <div style={compact ? undefined : { marginBottom: 16 }}>
        <Slider k="salaryWeekly" name="Недельный ФОТ" fig={money(reserves.salaryWeekly)} min={0} max={60000} step={1000} salaryReserve={c.salaryReserve} />
      </div>
      <div style={compact ? undefined : { marginBottom: 16 }}>
        <Slider k="salaryWeeks" name="Недель в запасе" fig={reserves.salaryWeeks + " нед."} min={0} max={12} step={1} note={!compact} salaryReserve={c.salaryReserve} />
      </div>
      <div style={compact ? undefined : { marginBottom: 16 }}>
        <Slider k="tech" name="Резерв на тех. расходы" fig={money(reserves.tech)} min={0} max={120000} step={2500} salaryReserve={c.salaryReserve} />
      </div>
    </>
  );
  return compact ? <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 }}>{items}</div> : <>{items}</>;
}

/* ---------- reusable cards ---------- */
function HeroPair({ c }: { c: CompanyComputed }) {
  return (
    <div className="card hero-pair" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: 0 }}>
      <div style={{ padding: 24, borderRight: "1px solid var(--hair)", background: "var(--pos-bg)", borderRadius: "12px 0 0 12px" }}>
        <div className="k">Доступно к выводу</div>
        <div className="mono" style={{ fontSize: 38, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1, color: "var(--pos)" }}>
          {money(c.available)}
        </div>
        <div className="h-sub" style={{ marginTop: 6 }}>
          после резервов на зарплаты и тех. расходы
        </div>
      </div>
      <div style={{ padding: 24 }}>
        <div className="k">Общий баланс компании</div>
        <div className="mono" style={{ fontSize: 38, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1 }}>
          {money(c.total)}
        </div>
        <div className="h-sub" style={{ marginTop: 6 }}>
          кошельки USDT + рекламные агентства
        </div>
      </div>
    </div>
  );
}

function KpiStrip({ c }: { c: CompanyComputed }) {
  const { reserves, agencies, wallets } = useApp();
  const Kpi = ({ label, value, sub, muted }: { label: string; value: number; sub: string; muted?: boolean }) => (
    <div className={`card cat${muted ? " flat" : ""}`} style={{ gap: 8 }}>
      <div className="lab">{label}</div>
      <div className="val" style={muted ? { color: "var(--muted)" } : undefined}>
        {money(value)}
      </div>
      <div className="k" style={{ fontSize: 9.5 }}>
        {sub}
      </div>
    </div>
  );
  return (
    <div className="grid-4col" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
      <Kpi label="Кошельки USDT" value={c.walletsTotal} sub={wallets.length + " кошельков"} />
      <Kpi label="Агентства" value={c.agenciesTotal} sub={agencies.length + " агентств"} />
      <div className="card cat flat" style={{ gap: 8 }}>
        <div className="lab">Резерв на зарплаты</div>
        <div className="val" style={{ color: "var(--muted)" }}>
          {money(c.salaryReserve)}
        </div>
        <div className="k" style={{ fontSize: 9.5 }}>
          {reserves.salaryWeeks} нед. × {money(reserves.salaryWeekly)}
        </div>
      </div>
      <div className="card cat flat" style={{ gap: 8 }}>
        <div className="lab">Резерв на тех. расходы</div>
        <div className="val" style={{ color: "var(--muted)" }}>
          {money(reserves.tech)}
        </div>
        <div className="k" style={{ fontSize: 9.5 }}>
          ежемесячно
        </div>
      </div>
    </div>
  );
}

function ChartCard({ c }: { c: CompanyComputed }) {
  const { history } = useApp();
  return (
    <div className="card" style={{ padding: 24 }}>
      <CompanyChart history={history} available={c.available} />
    </div>
  );
}

function WalletsCard({ c }: { c: CompanyComputed }) {
  const { wallets, open, toggleOpen, deleteCompanyWallet } = useApp();
  const [modal, setModal] = useState(false);
  const del = deleteCompanyWallet;
  return (
    <div className="card" style={{ padding: "6px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 4px 8px" }}>
        <span className="k">Кошельки USDT</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
            {money(c.walletsTotal)}
          </span>
          <button className="btn primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setModal(true)}>
            + Кошелёк
          </button>
        </div>
      </div>
      {wallets.length === 0 && (
        <div className="h-sub" style={{ padding: "10px 4px 16px" }}>
          Кошельков пока нет. Нажмите «+ Кошелёк», укажите адрес и контур — баланс подтянется из блокчейна.
        </div>
      )}
      <WalletGroup groupKey="clean" tone="clean" title="Чистые" hint="отдельный контур" wallets={wallets.filter((w) => w.group === "clean")} open={open.clean} onToggle={() => toggleOpen("clean")} onDelete={del} />
      <WalletGroup groupKey="dirtyMain" tone="dirty" title="Грязные — основные" hint="рабочие кошельки" wallets={wallets.filter((w) => w.group === "dirty" && w.type === "main")} open={open.dirtyMain} onToggle={() => toggleOpen("dirtyMain")} onDelete={del} />
      <WalletGroup groupKey="dirtySmall" tone="dirty" title="Грязные — мелкие" hint="остатки" wallets={wallets.filter((w) => w.group === "dirty" && w.type === "small")} open={open.dirtySmall} onToggle={() => toggleOpen("dirtySmall")} onDelete={del} />
      {modal && <AddWalletModal onClose={() => setModal(false)} />}
    </div>
  );
}

function AgenciesCard({ c }: { c: CompanyComputed }) {
  const [modal, setModal] = useState(false);
  return (
    <div className="card" style={{ padding: "6px 22px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 4px 8px" }}>
        <span className="k">Рекламные агентства</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
            {money(c.agenciesTotal)}
          </span>
          <button className="btn primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setModal(true)}>
            + Агентство
          </button>
        </div>
      </div>
      <AgenciesGroup c={c} />
      {modal && <AddAgencyModal onClose={() => setModal(false)} />}
    </div>
  );
}

function ResetBtn() {
  const { resetReserves } = useApp();
  return (
    <button onClick={resetReserves} style={{ background: "none", border: "none", color: "var(--sync)", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--sans)" }}>
      сбросить
    </button>
  );
}

function ReservesCard({ c }: { c: CompanyComputed }) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="k">Резервы — what-if</span>
        <ResetBtn />
      </div>
      <p className="h-sub" style={{ margin: "0 0 16px" }}>
        Подвигайте ползунки — «доступно» пересчитается мгновенно.
      </p>
      <div>
        <ReservesSliders c={c} compact={false} />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 2px", borderTop: "1px solid var(--hair)", marginTop: 4 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>Доступно к выводу</span>
        <span className="mono" style={{ fontSize: 18, fontWeight: 600, color: "var(--pos)" }}>
          {money(c.available)}
        </span>
      </div>
    </div>
  );
}

function WaterfallCard({ c, tech }: { c: CompanyComputed; tech: number }) {
  return (
    <div className="card" style={{ padding: 22 }}>
      <div className="k" style={{ marginBottom: 10 }}>
        Как считается
      </div>
      <div>
        <Waterfall c={c} tech={tech} />
      </div>
    </div>
  );
}

/* ---------- layouts ---------- */
function LayoutDash({ c, tech }: { c: CompanyComputed; tech: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <HeroPair c={c} />
      <KpiStrip c={c} />
      <ChartCard c={c} />
      <div className="grid-sticky" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <WalletsCard c={c} />
          <AgenciesCard c={c} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <ReservesCard c={c} />
          <WaterfallCard c={c} tech={tech} />
        </div>
      </div>
    </div>
  );
}

function LayoutCalc({ c, tech }: { c: CompanyComputed; tech: number }) {
  return (
    <div className="grid-sticky" style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, alignItems: "start" }}>
      <aside className="card" style={{ padding: 24, position: "sticky", top: 0 }}>
        <div className="k">Доступно к выводу</div>
        <div className="mono" style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-.025em", margin: "6px 0 4px", lineHeight: 1, color: "var(--pos)" }}>
          {money(c.available)}
        </div>
        <div className="h-sub">
          из общего баланса <b className="mono" style={{ color: "var(--ink)" }}>{money(c.total)}</b>
        </div>
        <div style={{ height: 1, background: "var(--hair)", margin: "18px 0" }} />
        <div className="k" style={{ marginBottom: 8 }}>
          Как считается
        </div>
        <div>
          <Waterfall c={c} tech={tech} />
        </div>
        <div style={{ height: 1, background: "var(--hair)", margin: "18px 0" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <span className="k">Резервы — what-if</span>
          <ResetBtn />
        </div>
        <div>
          <ReservesSliders c={c} compact={false} />
        </div>
      </aside>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <ChartCard c={c} />
        <WalletsCard c={c} />
        <AgenciesCard c={c} />
      </div>
    </div>
  );
}

function LayoutReport({ c, tech }: { c: CompanyComputed; tech: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <div className="k">Доступно к выводу</div>
            <div className="mono" style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1, color: "var(--pos)" }}>
              {money(c.available)}
            </div>
          </div>
          <div>
            <div className="k">Общий баланс</div>
            <div className="mono" style={{ fontSize: 36, fontWeight: 500, letterSpacing: "-.025em", marginTop: 6, lineHeight: 1 }}>
              {money(c.total)}
            </div>
          </div>
        </div>
        <div style={{ paddingTop: 16, borderTop: "1px solid var(--hair)", fontSize: 13.5, color: "var(--ink-2)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{money(c.walletsTotal)}</span> кошельки
          <span className="mono" style={{ color: "var(--pos)", fontWeight: 600 }}>+</span>
          <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{money(c.agenciesTotal)}</span> агентства
          <span className="mono" style={{ color: "var(--neg)", fontWeight: 600 }}>−</span>
          <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{money(c.salaryReserve)}</span> зарплаты
          <span className="mono" style={{ color: "var(--neg)", fontWeight: 600 }}>−</span>
          <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{money(tech)}</span> тех. расходы
        </div>
      </div>
      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span className="k">Структура вывода</span>
          <ResetBtnLabel />
        </div>
        <div>
          <Waterfall c={c} tech={tech} />
        </div>
        <div style={{ paddingTop: 18, marginTop: 8, borderTop: "1px solid var(--hair)" }}>
          <ReservesSliders c={c} compact />
        </div>
      </div>
      <WalletsCard c={c} />
      <AgenciesCard c={c} />
      <ChartCard c={c} />
    </div>
  );
}

function ResetBtnLabel() {
  const { resetReserves } = useApp();
  return (
    <button onClick={resetReserves} style={{ background: "none", border: "none", color: "var(--sync)", fontSize: 11.5, cursor: "pointer", fontFamily: "var(--sans)" }}>
      сбросить резервы
    </button>
  );
}

/* ---------- main ---------- */
export default function Company() {
  const { layout, setLayout, reserves, compute, companySynced, companySyncing, refreshCompany } = useApp();
  const c = compute();

  const Tab = ({ v, l }: { v: CompanyLayout; l: string }) => (
    <button className={layout === v ? "on" : ""} onClick={() => setLayout(v)}>
      {l}
    </button>
  );

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="h-title">Баланс компании</h1>
          <p className="h-sub">Финансовый учёт · USDT</p>
        </div>
        <div className="seg" style={{ flex: "none" }}>
          <Tab v="dash" l="Дашборд" />
          <Tab v="calc" l="Калькулятор" />
          <Tab v="report" l="Отчёт" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="badge sync">
            <span className="dt" />
            Tronscan · <span>{companySynced}</span>
          </span>
          <button className={`iconbtn${companySyncing ? " spin" : ""}`} onClick={refreshCompany}>
            <Icon name="refresh" />
          </button>
        </div>
      </div>

      {layout === "dash" && <LayoutDash c={c} tech={reserves.tech} />}
      {layout === "calc" && <LayoutCalc c={c} tech={reserves.tech} />}
      {layout === "report" && <LayoutReport c={c} tech={reserves.tech} />}
    </>
  );
}
