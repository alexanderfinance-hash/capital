"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { DEFAULT_RESERVES } from "./mockData";
import type { Asset, Dividend, PersonalStore, Agency, Reserves, HistoryPoint, Wallet, InitialData } from "./types";

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
  wallets: Wallet[];
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

/** Fire-and-forget JSON request; failures (e.g. dev without DB) are swallowed
 *  so the optimistic UI update stands. Returns parsed body or null. */
async function api(method: string, url: string, body: unknown): Promise<any | null> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    return await res.json().catch(() => ({}));
  } catch {
    return null;
  }
}

export function AppProvider({ initial, children }: { initial: InitialData; children: React.ReactNode }) {
  const [store, setStore] = useState<PersonalStore>(() => ({
    assets: initial.personal.assets.map((a) => ({ ...a })),
    flows: { expenses: { ...initial.personal.flows.expenses }, dividends: { ...initial.personal.flows.dividends } },
    expenseCats: initial.personal.expenseCats.map((c) => ({ ...c })),
    expenseMonths: initial.personal.expenseMonths.map((m) => ({ ...m })),
    coins: initial.personal.coins.map((c) => ({ ...c })),
    dividendsList: initial.personal.dividendsList.map((d) => ({ ...d })),
  }));
  const [personalSynced, setPersonalSynced] = useState(initial.personal.synced);
  const [personalSyncing, setPersonalSyncing] = useState(false);

  const [reserves, setReserves] = useState<Reserves>(initial.company.reserves);
  const [agencies, setAgencies] = useState<Agency[]>(initial.company.agencies.map((a) => ({ ...a })));
  const [wallets] = useState<Wallet[]>(initial.company.wallets.map((w) => ({ ...w })));
  const [history] = useState<HistoryPoint[]>(initial.company.history.map((h) => ({ ...h })));
  const [open, setOpen] = useState<OpenGroups>({ clean: true, dirtyMain: false, dirtySmall: false, agencies: false });
  const [editing, setEditing] = useState<string | null>(null);
  const [layout, setLayout] = useState<CompanyLayout>("dash");
  const [companySynced, setCompanySynced] = useState(initial.company.synced);
  const [companySyncing, setCompanySyncing] = useState(false);

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reserveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const personalTotal = useMemo(() => store.assets.reduce((s, a) => s + a.value, 0), [store.assets]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2200);
  }, []);

  const addAsset = useCallback((a: Omit<Asset, "id">) => {
    const tempId = "tmp-" + Date.now();
    setStore((prev) => ({ ...prev, assets: [...prev.assets, { ...a, id: tempId }] }));
    api("POST", "/api/assets", a).then((res) => {
      if (res?.id) setStore((prev) => ({ ...prev, assets: prev.assets.map((x) => (x.id === tempId ? { ...x, id: res.id } : x)) }));
    });
  }, []);

  const addDividend = useCallback((d: Dividend) => {
    setStore((prev) => {
      const dividendsList = [d, ...prev.dividendsList];
      return { ...prev, dividendsList, flows: { ...prev.flows, dividends: { value: dividendsList.reduce((s, x) => s + x.amount, 0) } } };
    });
    api("POST", "/api/dividends", d);
  }, []);

  const refreshPersonal = useCallback(() => {
    setPersonalSyncing(true);
    setPersonalSynced("Синхронизация…");
    fetch("/api/sync/crypto", { method: "POST" })
      .then((r) => r.json().catch(() => ({})))
      .then((res) => {
        setPersonalSyncing(false);
        if (res && res.ok && Array.isArray(res.coins) && res.coins.length) {
          toast("Балансы обновлены · цены актуальны");
          window.location.reload();
        } else {
          setPersonalSynced("Обновлено только что");
          toast("Синхронизация недоступна (нет доступа к блокчейну/курсам)");
        }
      })
      .catch(() => {
        setPersonalSyncing(false);
        setPersonalSynced("Обновлено только что");
        toast("Не удалось синхронизировать");
      });
  }, [toast]);

  const persistReserves = useCallback((r: Reserves) => {
    if (reserveTimer.current) clearTimeout(reserveTimer.current);
    reserveTimer.current = setTimeout(() => api("PUT", "/api/reserves", r), 400);
  }, []);

  const setReserve = useCallback(
    (key: keyof Reserves, value: number) => {
      setReserves((prev) => {
        const next = { ...prev, [key]: value };
        persistReserves(next);
        return next;
      });
    },
    [persistReserves]
  );

  const resetReserves = useCallback(() => {
    setReserves({ ...DEFAULT_RESERVES });
    api("PUT", "/api/reserves", DEFAULT_RESERVES);
  }, []);

  const setAgencyBalance = useCallback((id: string, balance: number) => {
    setAgencies((prev) => prev.map((a) => (a.id === id ? { ...a, balance, updated: "только что", staleDays: 0 } : a)));
    api("PATCH", `/api/agencies/${id}`, { balance });
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

  const walletsTotal = useMemo(() => wallets.reduce((s, w) => s + w.balance, 0), [wallets]);
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
    wallets,
    history,
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
