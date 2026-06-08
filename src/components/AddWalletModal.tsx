"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/store";

export function AddWalletModal({ onClose }: { onClose: () => void }) {
  const { addCompanyWallet } = useApp();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<"clean" | "dirty">("dirty");
  const [kind, setKind] = useState<"main" | "small">("main");
  const [err, setErr] = useState(false);
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const r = requestAnimationFrame(() => setShow(true));
    const t = setTimeout(() => ref.current?.focus(), 50);
    return () => {
      cancelAnimationFrame(r);
      clearTimeout(t);
    };
  }, []);

  const save = () => {
    const addr = address.trim();
    if (!addr) {
      setErr(true);
      return;
    }
    addCompanyWallet({ address: addr, label: label.trim(), group, kind });
    onClose();
  };

  const Seg = ({ value, opts, onChange }: { value: string; opts: { v: string; l: string }[]; onChange: (v: string) => void }) => (
    <div className="seg-cat">
      {opts.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`modal-overlay${show ? " show" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ds">
        <div className="modal-head">
          <h3 className="h-title" style={{ fontSize: 17 }}>
            Добавить кошелёк (USDT-TRC20)
          </h3>
          <button className="iconbtn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <label className="fld">
            <span className="k">Адрес кошелька (Tron)</span>
            <input ref={ref} type="text" placeholder="T..." autoComplete="off" className={err ? "err" : ""} value={address} onChange={(e) => { setAddress(e.target.value); setErr(false); }} />
          </label>
          <label className="fld">
            <span className="k">Название</span>
            <input type="text" placeholder="Напр. Основной чистый" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="fld">
            <span className="k">Контур</span>
            <Seg value={group} opts={[{ v: "clean", l: "Чистый" }, { v: "dirty", l: "Грязный" }]} onChange={(v) => setGroup(v as "clean" | "dirty")} />
          </label>
          <label className="fld">
            <span className="k">Тип</span>
            <Seg value={kind} opts={[{ v: "main", l: "Основной" }, { v: "small", l: "Мелкий" }]} onChange={(v) => setKind(v as "main" | "small")} />
          </label>
          <div className="hint">Баланс подтянется автоматически из блокчейна при синхронизации.</div>
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
