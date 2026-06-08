"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import { Chip, Badge, Donut } from "@/lib/chart";
import { Icon } from "../Icon";
import { Topbar } from "../ui";
import { AddAssetModal } from "../AddAssetModal";

export default function Assets() {
  const { store, personalTotal, deleteAsset, toast } = useApp();
  const [modal, setModal] = useState(false);

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
              Пока нет активов. Нажмите «+ Добавить актив» (наличные, авто, ценные вещи). Крипта появится автоматически после синхронизации.
            </div>
          )}
          {store.assets.map((a) => (
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
              {a.src === "manual" ? (
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
            </div>
          ))}
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
