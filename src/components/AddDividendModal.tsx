"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "@/lib/store";
import { fmt } from "@/lib/format";

export function AddDividendModal({ onClose }: { onClose: () => void }) {
  const { addDividend, toast } = useApp();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
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
    const value = parseFloat((val || "").replace(/[^\d.]/g, "")) || 0;
    if (value <= 0) {
      setErr(true);
      return;
    }
    addDividend({ name: name.trim() || "Выплата", date: date.trim() || "сегодня", amount: value });
    onClose();
    toast(`Дивиденды: +${fmt(value)}`);
  };

  return (
    <div className={`modal-overlay${show ? " show" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal ds">
        <div className="modal-head">
          <h3 className="h-title" style={{ fontSize: 17 }}>
            Добавить выплату
          </h3>
          <button className="iconbtn" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          <label className="fld">
            <span className="k">Источник / тикер</span>
            <input type="text" placeholder="Напр. Стейкинг ETH" autoComplete="off" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="fld">
            <span className="k">Дата</span>
            <input type="text" placeholder="Напр. 10 июн" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="fld">
            <span className="k">Сумма, $</span>
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
