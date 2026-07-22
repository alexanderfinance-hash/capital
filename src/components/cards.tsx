"use client";

import React from "react";
import { Icon } from "./Icon";
import { Badge, Chip } from "@/lib/chart";
import { fmt, fmtAmount, fmtTonNumbers, fmtRub } from "@/lib/format";
import type { Asset } from "@/lib/types";

export function CatCard({ a }: { a: Asset }) {
  const isTon = a.symbol === "TONNUM";
  const isRub = a.currency === "RUB" && a.nativeValue != null;
  const isLia = !!a.liability;
  return (
    <div className="card cat">
      <div className="row1">
        <div className="tile">
          <Icon name={a.icon} />
        </div>
        <Badge src={a.src} />
      </div>
      <div className="lab">{a.name}</div>
      <div className="val" style={isLia ? { color: "var(--neg)" } : undefined}>
        {isLia ? "−" : ""}
        {fmt(a.value)}
      </div>
      <div className="row2">
        {!isLia && <Chip d={a.delta} />}
        {isRub ? (
          <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {fmtRub(a.nativeValue as number)}
          </span>
        ) : (
          a.amount != null &&
          (isTon || a.symbol) && (
            <span className="mono" style={{ fontSize: 11.5, color: "var(--muted)" }}>
              {isTon ? fmtTonNumbers(a.amount) : `${fmtAmount(a.amount)} ${a.symbol}`}
            </span>
          )
        )}
      </div>
    </div>
  );
}

export function FlowCard({
  icon,
  lab,
  cap,
  val,
  right,
  src,
}: {
  icon: string;
  lab: string;
  cap: string;
  val: string;
  right: React.ReactNode;
  src: string;
}) {
  return (
    <div className="card cat flat">
      <div className="row1">
        <div className="tile">
          <Icon name={icon} />
        </div>
        <Badge src={src} />
      </div>
      <div>
        <div className="lab">{lab}</div>
        <div className="k" style={{ marginTop: 2, fontSize: 9.5 }}>
          {cap}
        </div>
      </div>
      <div className="val">{val}</div>
      <div className="row2">{right}</div>
    </div>
  );
}

export function AddAssetCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="card add-asset"
      onClick={onClick}
      style={{
        borderStyle: "dashed",
        borderColor: "var(--faint)",
        background: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        color: "var(--muted)",
        cursor: "pointer",
        minHeight: 150,
        fontFamily: "var(--sans)",
      }}
    >
      <span className="tile" style={{ borderStyle: "dashed" }}>
        <Icon name="plus" />
      </span>
      <span style={{ fontSize: 12, fontWeight: 500 }}>Добавить актив</span>
    </button>
  );
}
