"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Badge } from "@/lib/chart";
import { useApp } from "@/lib/store";
import { fmt, fmtTonNumbers, fmtRub } from "@/lib/format";
import type { AssetBucket, DataSource } from "@/lib/types";

interface CatDef {
  label: string;
  icon: string;
  bucket: AssetBucket;
  src: DataSource;
  tonNumber?: boolean; // quantity-driven, auto-priced from nums888.io
}

const CATS: CatDef[] = [
  { label: "Наличные", icon: "cash", bucket: "cash", src: "manual" },
  { label: "Автомобиль", icon: "car", bucket: "vehicles", src: "manual" },
  { label: "Ценная вещь", icon: "gem", bucket: "other", src: "manual" },
  { label: "Счёт / баланс", icon: "building", bucket: "other", src: "manual" },
  { label: "TON номера", icon: "phone", bucket: "other", src: "manual", tonNumber: true },
  { label: "Криптокошелёк", icon: "wallet", bucket: "crypto", src: "sync" },
  { label: "Прочий актив", icon: "box", bucket: "other", src: "manual" },
];

export function AddAssetModal({ onClose }: { onClose: () => void }) {
  const { addAsset, toast, tonNumberRate, usdRub } = useApp();
  const [cat, setCat] = useState(0);
  const [name, setName] = useState("");
  const [val, setVal] = useState("");
  const [cur, setCur] = useState<"USD" | "RUB">("USD");
  const [err, setErr] = useState(false);
  const [show, setShow] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const r = requestAnimationFrame(() => setShow(true));
    const t = setTimeout(() => nameRef.current?.focus(), 50);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, []);

  const c = CATS[cat];
  const unit = tonNumberRate.usd;
  // Currency choice applies to value-based manual assets (cash / car / valuables / other).
  const showCurrency = !c.tonNumber && c.src === "manual";
  const isRub = showCurrency && cur === "RUB";
  const parsed = parseFloat((val || "").replace(/[^\d.]/g, "")) || 0;
  const previewUsd = isRub && usdRub > 0 ? Math.round(parsed / usdRub) : 0;

  const save = () => {
    const n = parsed;
    if (n <= 0) {
      setErr(true);
      return;
    }
    if (c.tonNumber) {
      const qty = Math.round(n);
      const finalName = name.trim() || c.label;
      // Value is priced from the latest rate; the server re-prices and the
      // tonnums sync keeps it fresh afterwards.
      addAsset({ icon: c.icon, name: finalName, value: unit > 0 ? Math.round(qty * unit) : 0, delta: null, amount: qty, symbol: "TONNUM", src: "manual", bucket: c.bucket });
      onClose();
      toast(`Добавлено: ${finalName} · ${fmtTonNumbers(qty)}`);
      return;
    }
    const finalName = name.trim() || c.label;
    if (isRub) {
      // Store the original RUB amount; value is shown in USD at the current CBR rate.
      const usd = usdRub > 0 ? Math.round(n / usdRub) : n;
      addAsset({ icon: c.icon, name: finalName, value: usd, delta: null, currency: "RUB", nativeValue: n, src: c.src, bucket: c.bucket });
      onClose();
      toast(`Добавлено: ${finalName} · ${fmtRub(n)} ≈ ${fmt(usd)}`);
      return;
    }
    addAsset({ icon: c.icon, name: finalName, value: n, delta: c.src === "sync" ? 0 : null, currency: "USD", src: c.src, bucket: c.bucket });
    onClose();
    toast(`Добавлено: ${finalName} · ${fmt(n)}`);
  };

  return (
    <div className={`modal-overlay${show ? " show" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ds">
        <div className="modal-head">
          <h3 className="h-title" style={{ fontSize: 17 }}>
            Добавить актив вручную
          </h3>
          <button className="iconbtn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <label className="fld">
            <span className="k">Категория</span>
            <div className="seg-cat">
              {CATS.map((cc, i) => (
                <button key={i} type="button" className={i === cat ? "on" : ""} onClick={() => setCat(i)}>
                  {cc.label}
                </button>
              ))}
            </div>
          </label>
          <label className="fld">
            <span className="k">Название</span>
            <input type="text" placeholder={c.tonNumber ? "Напр. Анонимные TON номера" : "Напр. Tesla Model 3"} autoComplete="off" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {showCurrency && (
            <label className="fld">
              <span className="k">Валюта</span>
              <div className="seg-cat">
                <button type="button" className={cur === "USD" ? "on" : ""} onClick={() => setCur("USD")}>
                  $ Доллары
                </button>
                <button type="button" className={cur === "RUB" ? "on" : ""} onClick={() => setCur("RUB")}>
                  ₽ Рубли
                </button>
              </div>
            </label>
          )}
          <label className="fld">
            <span className="k">{c.tonNumber ? "Количество, шт" : isRub ? "Стоимость, ₽" : "Стоимость, $"}</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              className={err ? "err" : ""}
              value={val}
              onChange={(e) => {
                setVal(e.target.value);
                setErr(false);
              }}
            />
          </label>
          {isRub && (
            <div className="hint" style={{ color: "var(--muted)" }}>
              {parsed > 0 && usdRub > 0 ? (
                <>
                  ≈ <span className="mono">{fmt(previewUsd)}</span> по курсу ЦБ (<span className="mono">₽{usdRub.toFixed(2)}</span>/$). Сумма пересчитывается в доллары автоматически.
                </>
              ) : (
                <>Введите сумму в рублях — покажу её в долларах по актуальному курсу ЦБ.</>
              )}
            </div>
          )}
          {c.tonNumber && (
            <div className="hint" style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
              <span>
                Стоимость подтянется автоматически по курсу{" "}
                <a href="https://nums888.io/" target="_blank" rel="noreferrer" style={{ color: "var(--ink-2)" }}>
                  nums888.io
                </a>{" "}
                (1 анонимный TON номер).
              </span>
              {unit > 0 ? (
                <span style={{ color: "var(--muted)" }}>
                  Текущий курс: <span className="mono">{fmt(unit)}</span> за 1 номер · обновлено {tonNumberRate.synced}
                </span>
              ) : (
                <span style={{ color: "var(--muted)" }}>Курс подтянется при ближайшей синхронизации.</span>
              )}
            </div>
          )}
          {c.src === "sync" && !c.tonNumber && (
            <div className="hint" style={{ display: "flex" }}>
              <Badge src="sync" /> Баланс и цена будут подтягиваться автоматически
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button className="btn primary" onClick={save}>
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
