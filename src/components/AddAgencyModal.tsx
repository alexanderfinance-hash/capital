"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/store";

export function AddAgencyModal({ onClose }: { onClose: () => void }) {
  const { addAgency } = useApp();
  const [platform, setPlatform] = useState("");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [by, setBy] = useState("");
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
    const value = parseFloat((balance || "").replace(/[^\d.]/g, "")) || 0;
    addAgency({ platform: platform.trim() || "Агентство", name: name.trim(), balance: value, by: by.trim() || "—" });
    onClose();
  };

  return (
    <div className={`modal-overlay${show ? " show" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ds">
        <div className="modal-head">
          <h3 className="h-title" style={{ fontSize: 17 }}>
            Добавить агентство
          </h3>
          <button className="iconbtn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <label className="fld">
            <span className="k">Платформа</span>
            <input ref={ref} type="text" placeholder="Напр. Meta Ads" autoComplete="off" value={platform} onChange={(e) => setPlatform(e.target.value)} />
          </label>
          <label className="fld">
            <span className="k">Название</span>
            <input type="text" placeholder="Напр. Agency Alpha" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="fld">
            <span className="k">Баланс, $</span>
            <input type="text" inputMode="numeric" placeholder="0" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </label>
          <label className="fld">
            <span className="k">Кто внёс</span>
            <input type="text" placeholder="Имя" autoComplete="off" value={by} onChange={(e) => setBy(e.target.value)} />
          </label>
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
