"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { fmt, fmtTonNumbers, fmtRub } from "@/lib/format";
import { Chip, Badge, Donut, RadarChart } from "@/lib/chart";
import { Icon } from "../Icon";
import { Topbar } from "../ui";
import { AddAssetModal } from "../AddAssetModal";
import type { Asset } from "@/lib/types";

/** Цвет пометки нематериальных активов (сферы жизни). */
const INTANGIBLE_BLUE = "#3b6ef0";

/* Collapsible groups (как категории расходов): крипта, TON номера, машины и т.д. */
const GROUP_DEFS: { key: string; name: string; icon: string; match: (a: Asset) => boolean }[] = [
  { key: "crypto", name: "Крипта", icon: "coins", match: (a) => a.bucket === "crypto" && a.symbol !== "TONNUM" },
  { key: "tonnum", name: "TON номера", icon: "phone", match: (a) => a.symbol === "TONNUM" },
  { key: "vehicles", name: "Машины", icon: "car", match: (a) => a.bucket === "vehicles" && !a.liability },
  { key: "cash", name: "Наличные", icon: "cash", match: (a) => a.bucket === "cash" && !a.liability },
  { key: "liabilities", name: "Задолженности", icon: "receipt", match: (a) => !!a.liability },
  { key: "intangible", name: "Нематериальные активы", icon: "gem", match: (a) => a.bucket === "intangible" },
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
  const { store, personalTotal, deleteAsset, setAssetAmount, setAssetNative, setAssetValue, setAssetInvestment, tonNumberRate, toast } = useApp();
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => setOpenGroups((p) => ({ ...p, [key]: !p[key] }));
  const [wheelOpen, setWheelOpen] = useState(true);

  const groups = [...GROUP_DEFS.map((g) => ({ ...g, items: [] as Asset[] })), { key: "other", name: "Прочее", icon: "box", match: () => true, items: [] as Asset[] }];
  store.assets.forEach((a) => {
    (groups.find((g) => g.match(a)) ?? groups[groups.length - 1]).items.push(a);
  });
  const visibleGroups = groups.filter((g) => g.items.length > 0);

  const isRubAsset = (a: Asset) => a.currency === "RUB" && a.nativeValue != null;
  // Ручной актив в долларах (прочее, нематериальные, наличные/авто в $, долги) —
  // редактируем стоимость в $ напрямую. Синк-активы (крипта) не редактируются.
  const isUsdManual = (a: Asset) => a.src === "manual" && a.symbol !== "TONNUM" && !isRubAsset(a);
  const startEdit = (a: Asset) => {
    setEditId(a.id);
    setEditVal(String(a.symbol === "TONNUM" ? a.amount ?? 0 : isRubAsset(a) ? a.nativeValue ?? 0 : a.value));
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
    } else if (isRubAsset(a)) {
      if (n !== a.nativeValue) {
        setAssetNative(a.id, n);
        toast(`Обновлено: ${a.name} · ${fmtRub(n)}`);
      }
    } else if (n !== a.value) {
      setAssetValue(a.id, n);
      toast(`Обновлено: ${a.name} · ${fmt(n)}`);
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
            const isLia = g.key === "liabilities";
            const isIntangible = g.key === "intangible";
            return (
              <div key={g.key} style={isIntangible ? { borderLeft: `3px solid ${INTANGIBLE_BLUE}` } : undefined}>
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
                  <div className="tile" style={isIntangible ? { background: `${INTANGIBLE_BLUE}1a`, color: INTANGIBLE_BLUE } : undefined}>
                    <Icon name={g.icon} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: isIntangible ? INTANGIBLE_BLUE : undefined }}>{g.name}</div>
                    <div className="mono" style={{ marginTop: 3, fontSize: 11.5, color: "var(--muted)" }}>
                      {pluralAssets(g.items.length)}{isIntangible ? " · не в капитале" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: isLia ? "var(--neg)" : isIntangible ? INTANGIBLE_BLUE : undefined }}>
                      {isLia ? "−" : ""}{fmt(total)}
                    </div>
                    {!isLia && !isIntangible && (
                      <div style={{ marginTop: 2 }}>
                        <Chip d={groupDelta(g.items)} />
                      </div>
                    )}
                  </div>
                </div>
                {isOpen &&
                  g.items.map((a) => {
            const isTon = a.symbol === "TONNUM";
            const isRub = isRubAsset(a);
            const isUsd = isUsdManual(a);
            const editable = isTon || isRub || isUsd;
            const isIntangibleItem = a.bucket === "intangible";
            const editing = editId === a.id;
            // Everything the user added is removable; only sync-managed coins
            // (crypto bucket with a ticker) are protected.
            const removable = !(a.bucket === "crypto" && !!a.symbol);
            const isLia = !!a.liability;
            // Manual assets can be marked as investments (crypto already is; долги и
            // нематериальные сферы — нет).
            const canFlag = a.bucket !== "crypto" && !isLia && !isIntangibleItem;
            const inInvest = !!a.investment;
            return (
              <div className="mlist-row" key={a.id} style={{ paddingLeft: 24 }}>
                <div className="tile">
                  <Icon name={a.icon} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: isIntangibleItem ? INTANGIBLE_BLUE : undefined }}>{a.name}</div>
                  <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {isIntangibleItem ? (
                      <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>сфера жизни · оценка в $</span>
                    ) : isTon ? (
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
                      {isTon ? "шт" : isRub ? "₽" : "$"}
                    </span>
                  </div>
                ) : (
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 500, color: isLia ? "var(--neg)" : isIntangibleItem ? INTANGIBLE_BLUE : undefined }}>
                      {isLia ? "−" : ""}{fmt(a.value)}
                    </div>
                    {!isLia && (
                      <div style={{ marginTop: 2 }}>
                        <Chip d={a.delta} />
                      </div>
                    )}
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

      {(() => {
        const spheres = store.assets.filter((a) => a.bucket === "intangible");
        if (spheres.length === 0) return null;
        const axes = spheres.map((a) => ({ label: a.name, value: a.value }));
        const total = spheres.reduce((s, a) => s + a.value, 0);
        const top = [...spheres].sort((x, y) => y.value - x.value);
        return (
          <div className="card" style={{ padding: "8px 22px", marginTop: 20, borderLeft: `3px solid ${INTANGIBLE_BLUE}` }}>
            <div
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 4px", cursor: "pointer", userSelect: "none" }}
              onClick={() => setWheelOpen((v) => !v)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--faint)", fontSize: 14, transition: "transform .15s", transform: `rotate(${wheelOpen ? 90 : 0}deg)` }}>›</span>
                <span className="k" style={{ color: INTANGIBLE_BLUE }}>Колесо баланса жизни</span>
              </div>
              <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: INTANGIBLE_BLUE }}>{fmt(total)}</span>
            </div>
            {wheelOpen && (
              <>
                <div className="h-sub" style={{ padding: "0 0 8px" }}>
                  Сферы жизни в денежном эквиваленте. По осям видно, что развито сильнее, а что отстаёт — цель равномерное «колесо». В капитал не входит.
                </div>
                {spheres.length < 3 ? (
                  <div className="h-sub" style={{ padding: "8px 0 16px" }}>
                    Добавьте минимум 3 сферы (кнопка «+ Добавить актив» → «Нематериальный актив»), чтобы построить колесо баланса.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 260px", gap: 20, alignItems: "center", padding: "6px 0 16px" }} className="grid-2col">
                    <RadarChart axes={axes} color={INTANGIBLE_BLUE} />
                    <div>
                      {top.map((a) => {
                        const pct = total ? Math.round((a.value / total) * 100) : 0;
                        return (
                          <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--hair-2)" }}>
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</span>
                            <span className="mono" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                              {fmt(a.value)} · {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {modal && <AddAssetModal onClose={() => setModal(false)} />}
    </>
  );
}
