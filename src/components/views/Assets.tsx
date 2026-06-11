"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { fmt, fmtTonNumbers, fmtRub } from "@/lib/format";
import { Chip, Badge, Donut } from "@/lib/chart";
import { Icon } from "../Icon";
import { Topbar } from "../ui";
import { AddAssetModal } from "../AddAssetModal";
import type { Asset } from "@/lib/types";

/* Collapsible groups (как категории расходов): крипта, TON номера, машины и т.д. */
const GROUP_DEFS: { key: string; name: string; icon: string; match: (a: Asset) => boolean }[] = [
  { key: "crypto", name: "Крипта", icon: "coins", match: (a) => a.bucket === "crypto" && a.symbol !== "TONNUM" },
  { key: "tonnum", name: "TON номера", icon: "phone", match: (a) => a.symbol === "TONNUM" },
  { key: "vehicles", name: "Машины", icon: "car", match: (a) => a.bucket === "vehicles" },
  { key: "cash", name: "Наличные", icon: "cash", match: (a) => a.bucket === "cash" },
];

const pluralAssets = (n: number) => {
  const m10 = n % 10,
    m100 = n % 100;
  const w = m10 === 1 && m100 !== 11 ? "актив" : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "актива" : "активов";
  return `${n} ${w}`;
};

/* Weighted group delta: восстанавливаем «вчерашнюю» стоимость из value/(1+d) по
   активам, у которых есть delta, и считаем общий % изменения группы. */
function groupDelta(items: Asset[]): number | null {
  let cur = 0,
    prev = 0;
  items.forEach((a) => {
    if (a.delta == null) return;
    cur += a.value;
    prev += a.value / (1 + a.delta / 100);
  });
  if (prev <= 0) return null;
  return +(((cur - prev) / prev) * 100).toFixed(1);
}

export default function Assets() {
  const { store, personalTotal, deleteAsset, setAssetAmount, setAssetNative, setAssetInvestment, tonNumberRate, toast } = useApp();
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => setOpenGroups((p) => ({ ...p, [key]: !p[key] }));

  const groups = [...GROUP_DEFS.map((g) => ({ ...g, items: [] as Asset[] })), { key: "other", name: "Прочее", icon: "box", match: () => true, items: [] as Asset[] }];
  store.assets.forEach((a) => {
    (groups.find((g) => g.match(a)) ?? groups[groups.length - 1]).items.push(a);
  });
  const visibleGroups = groups.filter((g) => g.items.length > 0);

  const isRubAsset = (a: Asset) => a.currency === "RUB" && a.nativeValue != null;
  const startEdit = (a: Asset) => {
    setEditId(a.id);
    setEditVal(String(a.symbol === "TONNUM" ? a.amount ?? 0 : a.nativeValue ?? 0));
  };
  const saveEdit = (a: Asset) => {
    const n = Math.round(parseFloat((editVal || "").replace(/[^\d.]/g, "")) || 0);
    setEditId(null);
    if (n <= 0) return;
    if (a.symbol === "TONNUM") {
      if (n !== a.amount) {
        setAssetAmount(a.id, n);
        toast(`Обновлено: ${a.name} · ${fmtTonNumbers(n)}`);
      }
    } else if (n !== a.nativeValue) {
      setAssetNative(a.id, n);
      toast(`Обновлено: ${a.name} · ${fmtRub(n)}`);
    }
  };

  return (
    <>
      <Topbar
        title="Активы"
        sub="Все источники капитала"
        right={
          <button className="btn primary" onClick={() => setModal(true)}>
            + Добавить актив
          </button>
        }
      />

      <div className="grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
        <div className="card" style={{ padding: "8px 22px" }}>
          <div className="k" style={{ padding: "14px 0 4px" }}>
            Все активы
          </div>
          {store.assets.length === 0 && (
            <div className="h-sub" style={{ padding: "18px 0" }}>
              Пока нет активов. Нажмите «+ Добавить актив» (наличные, авто, ценные вещи, TON номера). Крипта появится автоматически после синхронизации.
            </div>
          )}
          {visibleGroups.map((g) => {
            const isOpen = !!openGroups[g.key];
            const total = g.items.reduce((s, a) => s + a.value, 0);
            return (
              <div key={g.key}>
                <div
                  className="mlist-row"
                  style={{ cursor: "pointer", userSelect: "none" }}
                  onClick={() => toggleGroup(g.key)}
                >
                  <span
                    style={{ flex: "none", width: 12, color: "var(--faint)", fontSize: 14, transition: "transform .15s", transform: `rotate(${isOpen ? 90 : 0}deg)` }}
                  >
                    ›
                  </span>
                  <div className="tile">
                    <Icon name={g.icon} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{g.name}</div>
                    <div className="mono" style={{ marginTop: 3, fontSize: 11.5, color: "var(--muted)" }}>
                      {pluralAssets(g.items.length)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                      {fmt(total)}
                    </div>
                    <div style={{ marginTop: 2 }}>
                      <Chip d={groupDelta(g.items)} />
                    </div>
                  </div>
                </div>
                {isOpen &&
                  g.items.map((a) => {
            const isTon = a.symbol === "TONNUM";
            const isRub = isRubAsset(a);
            const editable = isTon || isRub;
            const editing = editId === a.id;
            // Everything the user added is removable; only sync-managed coins
            // (crypto bucket with a ticker) are protected.
            const removable = !(a.bucket === "crypto" && !!a.symbol);
            // Manual assets can be marked as investments (crypto already is).
            const canFlag = a.bucket !== "crypto";
            const inInvest = !!a.investment;
            return (
              <div className="mlist-row" key={a.id} style={{ paddingLeft: 24 }}>
                <div className="tile">
                  <Icon name={a.icon} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>{a.name}</div>
                  <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {isTon ? (
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {fmtTonNumbers(a.amount ?? 0)}
                        {tonNumberRate.usd > 0 ? (
                          <>
                            {" · "}курс {fmt(tonNumberRate.usd)}/номер
                          </>
                        ) : (
                          <>{" · "}курс подтянется при синхронизации</>
                        )}
                        {" · "}
                        <a href="https://nums888.io/" target="_blank" rel="noreferrer" style={{ color: "var(--muted)" }}>
                          nums888.io
                        </a>
                        {tonNumberRate.staleDays >= 0 && <> · {tonNumberRate.synced}</>}
                      </span>
                    ) : a.currency === "RUB" && a.nativeValue != null ? (
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {fmtRub(a.nativeValue)} · по курсу ЦБ
                      </span>
                    ) : (
                      <Badge src={a.src} />
                    )}
                  </div>
                </div>
                {editable && editing ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(a);
                        if (e.key === "Escape") setEditId(null);
                      }}
                      onBlur={() => saveEdit(a)}
                      style={{ width: isTon ? 72 : 120, textAlign: "right", padding: "4px 8px", fontSize: 13 }}
                      className="mono"
                    />
                    <span className="k" style={{ fontSize: 11 }}>
                      {isTon ? "шт" : "₽"}
                    </span>
                  </div>
                ) : (
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 500 }}>
                      {fmt(a.value)}
                    </div>
                    <div style={{ marginTop: 2 }}>
                      <Chip d={a.delta} />
                    </div>
                  </div>
                )}
                {canFlag ? (
                  <button
                    title={inInvest ? "В инвестициях — нажмите, чтобы убрать" : "Добавить во вкладку «Инвестиции»"}
                    onClick={() => {
                      setAssetInvestment(a.id, !inInvest);
                      toast(inInvest ? `${a.name}: убрано из инвестиций` : `${a.name}: учитывается в инвестициях`);
                    }}
                    style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: inInvest ? "var(--pos)" : "var(--faint)", padding: 4, display: "grid", placeItems: "center" }}
                  >
                    <Icon name="trend" style={{ width: 16, height: 16 }} />
                  </button>
                ) : null}
                {editable ? (
                  <button
                    title={isTon ? "Изменить количество" : "Изменить сумму в рублях"}
                    onClick={() => (editing ? saveEdit(a) : startEdit(a))}
                    style={{ marginLeft: canFlag ? 4 : 12, background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4, display: "grid", placeItems: "center" }}
                  >
                    <Icon name="sliders" style={{ width: 16, height: 16 }} />
                  </button>
                ) : null}
                {removable ? (
                  <button
                    title="Удалить"
                    onClick={() => {
                      deleteAsset(a.id);
                      toast(`Удалено: ${a.name}`);
                    }}
                    style={{ marginLeft: editable || canFlag ? 4 : 12, background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4, display: "grid", placeItems: "center" }}
                  >
                    <Icon name="close" style={{ width: 16, height: 16 }} />
                  </button>
                ) : (
                  <span style={{ width: 16, marginLeft: 12 }} />
                )}
              </div>
            );
          })}
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0", borderTop: "2px solid var(--hair)", marginTop: 6 }}>
            <span className="k">Итого капитал</span>
            <span className="mono" style={{ fontSize: 24, fontWeight: 600 }}>
              {fmt(personalTotal)}
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column" }}>
          <div className="k" style={{ marginBottom: 4 }}>
            Состав капитала
          </div>
          <Donut assets={store.assets} />
        </div>
      </div>

      {modal && <AddAssetModal onClose={() => setModal(false)} />}
    </>
  );
}
