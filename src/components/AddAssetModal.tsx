"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Badge } from "@/lib/chart";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";
import type { AssetBucket, DataSource } from "@/lib/types";

interface CatDef {
  label: string;
  icon: string;
  bucket: AssetBucket;
  src: DataSource;
}

const CATS: CatDef[] = [
  { label: "Наличные", icon: "cash", bucket: "cash", src: "manual" },
  { label: "Автомобиль", icon: "car", bucket: "vehicles", src: "manual" },
  { label: "Ценная вещь", icon: "gem", bucket: "other", src: "manual" },
  { label: "Криптокошелёк", icon: "wallet", bucket: "crypto", src: "sync" },
  { label: "Прочий актив", icon: "box", bucket: "other", src: "manual" },
];

export function AddAssetModal({ onClose }: { onClose: () => void }) {
  const { addAsset, toast } = useApp();
  const [cat, setCat] = useState(0);
  const [name, setName] = useState("");
  const [val, setVal] = useState("");
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

  const save = () => {
    const c = CATS[cat];
    const value = parseFloat((val || "").replace(/[^\d.]/g, "")) || 0;
    if (value <= 0) {
      setErr(true);
      return;
    }
    const finalName = name.trim() || c.label;
    addAsset({ icon: c.icon, name: finalName, value, delta: c.src === "sync" ? 0 : null, src: c.src, bucket: c.bucket });
    onClose();
    toast(`Добавлено: ${finalName} · ${fmt(value)}`);
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
              {CATS.map((c, i) => (
                <button key={i} type="button" className={i === cat ? "on" : ""} onClick={() => setCat(i)}>
                  {c.label}
                </button>
              ))}
            </div>
          </label>
          <label className="fld">
            <span className="k">Название</span>
            <input type="text" placeholder="Напр. Tesla Model 3" autoComplete="off" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="fld">
            <span className="k">Стоимость, $</span>
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
          {CATS[cat].src === "sync" && (
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
