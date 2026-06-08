"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/store";

const CHAINS = [
  { v: "BTC", l: "Bitcoin" },
  { v: "ETH", l: "Ethereum" },
  { v: "TRX", l: "Tron" },
  { v: "TON", l: "TON" },
];

export function AddPersonalWalletModal({ onClose }: { onClose: () => void }) {
  const { addPersonalWallet } = useApp();
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("BTC");
  const [label, setLabel] = useState("");
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
    addPersonalWallet({ address: addr, chain, label: label.trim() });
    onClose();
  };

  return (
    <div className={`modal-overlay${show ? " show" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ds">
        <div className="modal-head">
          <h3 className="h-title" style={{ fontSize: 17 }}>
            Добавить крипто-кошелёк
          </h3>
          <button className="iconbtn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <label className="fld">
            <span className="k">Сеть / монета</span>
            <div className="seg-cat">
              {CHAINS.map((c) => (
                <button key={c.v} type="button" className={chain === c.v ? "on" : ""} onClick={() => setChain(c.v)}>
                  {c.l}
                </button>
              ))}
            </div>
          </label>
          <label className="fld">
            <span className="k">Адрес кошелька</span>
            <input ref={ref} type="text" placeholder="Адрес…" autoComplete="off" className={err ? "err" : ""} value={address} onChange={(e) => { setAddress(e.target.value); setErr(false); }} />
          </label>
          <label className="fld">
            <span className="k">Название (необязательно)</span>
            <input type="text" placeholder="Напр. Холодный BTC" autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div className="hint">Баланс подтянется автоматически сразу после добавления.</div>
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
