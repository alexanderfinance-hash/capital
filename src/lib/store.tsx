"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { initialStore, WALLETS, AGENCIES, DEFAULT_RESERVES, HISTORY } from "./mockData";
import type { Asset, Dividend, PersonalStore, Agency, Reserves, HistoryPoint } from "./types";

export type CompanyLayout = "dash" | "calc" | "report";
export interface OpenGroups {
  clean: boolean;
  dirtyMain: boolean;
  dirtySmall: boolean;
  agencies: boolean;
}

export interface CompanyComputed {
  walletsTotal: number;
  agenciesTotal: number;
  salaryReserve: number;
  total: number;
  available: number;
}

interface AppState {
  /* personal */
  store: PersonalStore;
  personalTotal: number;
  addAsset: (a: Omit<Asset, "id">) => void;
  addDividend: (d: Dividend) => void;
  personalSynced: string;
  refreshPersonal: () => void;
  personalSyncing: boolean;

  /* company */
  wallets: typeof WALLETS;
  history: HistoryPoint[];
  reserves: Reserves;
  setReserve: (key: keyof Reserves, value: number) => void;
  resetReserves: () => void;
  agencies: Agency[];
  setAgencyBalance: (id: string, balance: number) => void;
  open: OpenGroups;
  toggleOpen: (k: keyof OpenGroups) => void;
  editing: string | null;
  setEditing: (id: string | null) => void;
  layout: CompanyLayout;
  setLayout: (l: CompanyLayout) => void;
  companySynced: string;
  companySyncing: boolean;
  refreshCompany: () => void;
  compute: () => CompanyComputed;

  /* ui */
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used within AppProvider");
  return c;
}

function loadReserves(): Reserves {
  if (typeof window === "undefined") return { ...DEFAULT_RESERVES };
  try {
    const raw = window.localStorage.getItem("lb_reserves");
    if (raw) return { ...DEFAULT_RESERVES, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_RESERVES };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<PersonalStore>(() => ({
    ...initialStore,
    assets: initialStore.assets.map((a) => ({ ...a })),
    dividendsList: initialStore.dividendsList.map((d) => ({ ...d })),
  }));
  const [personalSynced, setPersonalSynced] = useState("Обновлено 2 мин назад");
  const [personalSyncing, setPersonalSyncing] = useState(false);

  const [reserves, setReserves] = useState<Reserves>({ ...DEFAULT_RESERVES });
  const [agencies, setAgencies] = useState<Agency[]>(() => AGENCIES.map((a) => ({ ...a })));
  const [open, setOpen] = useState<OpenGroups>({ clean: true, dirtyMain: false, dirtySmall: false, agencies: false });
  const [editing, setEditing] = useState<string | null>(null);
  const [layout, setLayout] = useState<CompanyLayout>("dash");
  const [companySynced, setCompanySynced] = useState("2 мин назад");
  const [companySyncing, setCompanySyncing] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // hydrate reserves from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setReserves(loadReserves());
  }, []);

  const personalTotal = useMemo(() => store.assets.reduce((s, a) => s + a.value, 0), [store.assets]);

  const addAsset = useCallback((a: Omit<Asset, "id">) => {
    setStore((prev) => ({ ...prev, assets: [...prev.assets, { ...a, id: "u" + Date.now() }] }));
  }, []);

  const addDividend = useCallback((d: Dividend) => {
    setStore((prev) => {
      const dividendsList = [d, ...prev.dividendsList];
      return { ...prev, dividendsList, flows: { ...prev.flows, dividends: { value: dividendsList.reduce((s, x) => s + x.amount, 0) } } };
    });
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const refreshPersonal = useCallback(() => {
    setPersonalSyncing(true);
    setPersonalSynced("Синхронизация…");
    setTimeout(() => {
      setStore((prev) => ({
        ...prev,
        assets: prev.assets.map((a) =>
          a.src === "sync"
            ? { ...a, value: Math.round(a.value * (1 + (Math.random() * 0.04 - 0.012))), delta: +(Math.random() * 6 - 1.5).toFixed(1) }
            : a
        ),
      }));
      setPersonalSyncing(false);
      setPersonalSynced("Обновлено только что");
      toast("Кошельки синхронизированы · цены обновлены");
    }, 900);
  }, [toast]);

  const setReserve = useCallback((key: keyof Reserves, value: number) => {
    setReserves((prev) => {
      const next = { ...prev, [key]: value };
      try {
        window.localStorage.setItem("lb_reserves", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const resetReserves = useCallback(() => {
    setReserves({ ...DEFAULT_RESERVES });
    try {
      window.localStorage.setItem("lb_reserves", JSON.stringify(DEFAULT_RESERVES));
    } catch {}
  }, []);

  const setAgencyBalance = useCallback((id: string, balance: number) => {
    setAgencies((prev) => prev.map((a) => (a.id === id ? { ...a, balance, updated: "только что", staleDays: 0 } : a)));
  }, []);

  const toggleOpen = useCallback((k: keyof OpenGroups) => {
    setOpen((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  const refreshCompany = useCallback(() => {
    setCompanySyncing(true);
    setTimeout(() => {
      setCompanySyncing(false);
      setCompanySynced("только что");
    }, 1100);
  }, []);

  const walletsTotal = useMemo(() => WALLETS.reduce((s, w) => s + w.balance, 0), []);
  const compute = useCallback((): CompanyComputed => {
    const agenciesTotal = agencies.reduce((s, a) => s + a.balance, 0);
    const salaryReserve = reserves.salaryWeekly * reserves.salaryWeeks;
    const total = walletsTotal + agenciesTotal;
    const available = total - salaryReserve - reserves.tech;
    return { walletsTotal, agenciesTotal, salaryReserve, total, available };
  }, [agencies, reserves, walletsTotal]);

  const value: AppState = {
    store,
    personalTotal,
    addAsset,
    addDividend,
    personalSynced,
    refreshPersonal,
    personalSyncing,
    wallets: WALLETS,
    history: HISTORY,
    reserves,
    setReserve,
    resetReserves,
    agencies,
    setAgencyBalance,
    open,
    toggleOpen,
    editing,
    setEditing,
    layout,
    setLayout,
    companySynced,
    companySyncing,
    refreshCompany,
    compute,
    toast,
    toastMsg,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
