"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/store";

const CHAINS = [
  { v: "BTC", l: "Bitcoin", note: "Отслеживается BTC на адресе." },
  { v: "ETH", l: "Ethereum (ERC-20)", note: "Отслеживаются ETH + токены USDT, USDC и WBTC на этом адресе — отдельно монету выбирать не нужно." },
  { v: "BSC", l: "BNB Chain (BEP-20)", note: "Отслеживаются BNB + токены USDT, USDC и BTCB на этом адресе." },
  { v: "TRX", l: "Tron (TRC-20)", note: "Отслеживаются TRX + USDT (TRC-20) на этом адресе." },
  { v: "TON", l: "TON", note: "Отслеживается TON на адресе." },
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
            <span className="k">Сеть</span>
            <div className="seg-cat">
              {CHAINS.map((c) => (
                <button key={c.v} type="button" className={chain === c.v ? "on" : ""} onClick={() => setChain(c.v)}>
                  {c.l}
                </button>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              {CHAINS.find((c) => c.v === chain)?.note}
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
          <div className="hint">
            Баланс и цена подтянутся автоматически сразу после добавления и обновляются при каждой синхронизации.
            Когда USDT обменяется на BTC: если биткоин придёт на этот же адрес (как WBTC/BTCB) — он подхватится здесь;
            если на отдельный BTC-адрес — добавьте его как «Bitcoin». Холдинги пересчитываются на каждом синке, лишних действий не нужно.
          </div>
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
