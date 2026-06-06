"use client";

import React from "react";
import { Icon } from "./Icon";
import { Badge, Chip } from "@/lib/chart";
import { fmt } from "@/lib/format";
import type { Asset } from "@/lib/types";

export function CatCard({ a }: { a: Asset }) {
  return (
    <div className="card cat">
      <div className="row1">
        <div className="tile">
          <Icon name={a.icon} />
        </div>
        <Badge src={a.src} />
      </div>
      <div className="lab">{a.name}</div>
      <div className="val">{fmt(a.value)}</div>
      <div className="row2">
        <Chip d={a.delta} />
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
