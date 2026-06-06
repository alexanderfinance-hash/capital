"use client";

import { useApp } from "@/lib/store";

export function Toast() {
  const { toastMsg } = useApp();
  return <div className={`toast${toastMsg ? " show" : ""}`}>{toastMsg}</div>;
}
