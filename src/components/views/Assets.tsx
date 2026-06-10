"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { fmt, fmtTonNumbers } from "@/lib/format";
import { Chip, Badge, Donut } from "@/lib/chart";
import { Icon } from "../Icon";
import { Topbar } from "../ui";
import { AddAssetModal } from "../AddAssetModal";
import type { Asset } from "@/lib/types";

export default function Assets() {
  const { store, personalTotal, deleteAsset, setAssetAmount, tonNumberRate, toast } = useApp();
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const startEdit = (a: Asset) => {
    setEditId(a.id);
    setEditVal(String(a.amount ?? 0));
  };
  const saveEdit = (a: Asset) => {
    const qty = Math.round(parseFloat((editVal || "").replace(/[^\d.]/g, "")) || 0);
    setEditId(null);
    if (qty > 0 && qty !== a.amount) {
      setAssetAmount(a.id, qty);
      toast(`Обновлено: ${a.name} · ${fmtTonNumbers(qty)}`);
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
          {store.assets.map((a) => {
            const isTon = a.symbol === "TONNUM";
            const editing = editId === a.id;
            return (
              <div className="mlist-row" key={a.id}>
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
                        <a href="https://getgems.io/collection/EQAOQdwdw8kGftJCSFgOErM1mBjYPe4DBPq8-AhF6vr9si5N" target="_blank" rel="noreferrer" style={{ color: "var(--muted)" }}>
                          флор
                        </a>
                        {tonNumberRate.staleDays >= 0 && <> · {tonNumberRate.synced}</>}
                      </span>
                    ) : (
                      <Badge src={a.src} />
                    )}
                  </div>
                </div>
                {isTon && editing ? (
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
                      style={{ width: 72, textAlign: "right", padding: "4px 8px", fontSize: 13 }}
                      className="mono"
                    />
                    <span className="k" style={{ fontSize: 11 }}>
                      шт
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
                {isTon ? (
                  <button
                    title="Изменить количество"
                    onClick={() => (editing ? saveEdit(a) : startEdit(a))}
                    style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4, display: "grid", placeItems: "center" }}
                  >
                    <Icon name="sliders" style={{ width: 16, height: 16 }} />
                  </button>
                ) : a.src === "manual" ? (
                  <button
                    title="Удалить"
                    onClick={() => {
                      deleteAsset(a.id);
                      toast(`Удалено: ${a.name}`);
                    }}
                    style={{ marginLeft: 12, background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4, display: "grid", placeItems: "center" }}
                  >
                    <Icon name="close" style={{ width: 16, height: 16 }} />
                  </button>
                ) : (
                  <span style={{ width: 16, marginLeft: 12 }} />
                )}
                {isTon && (
                  <button
                    title="Удалить"
                    onClick={() => {
                      deleteAsset(a.id);
                      toast(`Удалено: ${a.name}`);
                    }}
                    style={{ marginLeft: 4, background: "none", border: "none", cursor: "pointer", color: "var(--faint)", padding: 4, display: "grid", placeItems: "center" }}
                  >
                    <Icon name="close" style={{ width: 16, height: 16 }} />
                  </button>
                )}
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
