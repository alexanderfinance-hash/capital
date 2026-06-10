"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { DEFAULT_RESERVES } from "./mockData";
import type { Asset, Dividend, PersonalStore, Agency, Reserves, HistoryPoint, Wallet, InitialData, PersonalWalletRow, SnapshotPoint, CompanyPayable, TonNumberRate } from "./types";

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
  agencyReserve: number; // резерв на рекламные агентства
  payable: number; // кредиторская задолженность CoinLink
  total: number;
  available: number;
}

interface AppState {
  /* personal */
  store: PersonalStore;
  personalTotal: number;
  capitalHistory: SnapshotPoint[];
  cryptoHistory: SnapshotPoint[];
  addAsset: (a: Omit<Asset, "id">) => void;
  addDividend: (d: Dividend) => void;
  deleteAsset: (id: string) => void;
  setAssetAmount: (id: string, amount: number) => void;
  setAssetNative: (id: string, nativeValue: number) => void;
  tonNumberRate: TonNumberRate;
  usdRub: number;
  personalWallets: PersonalWalletRow[];
  addPersonalWallet: (w: { address: string; chain: string; label: string }) => void;
  deletePersonalWallet: (id: string) => void;
  personalSynced: string;
  refreshPersonal: () => void;
  personalSyncing: boolean;

  /* company */
  wallets: Wallet[];
  addCompanyWallet: (w: { address: string; label: string; group: "clean" | "dirty"; kind: "main" | "small"; chain?: "TRX" | "ETH" | "BSC" }) => void;
  deleteCompanyWallet: (id: string) => void;
  history: HistoryPoint[];
  reserves: Reserves;
  setReserve: (key: keyof Reserves, value: number) => void;
  resetReserves: () => void;
  agencies: Agency[];
  setAgencyBalance: (id: string, balance: number) => void;
  addAgency: (a: { platform: string; name: string; balance: number; by: string }) => void;
  deleteAgency: (id: string) => void;
  payable: CompanyPayable;
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
    expensesByPeriod: initial.personal.expensesByPeriod,
    expenseSubs: initial.personal.expenseSubs,
    expenseMonths: initial.personal.expenseMonths.map((m) => ({ ...m })),
    coins: initial.personal.coins.map((c) => ({ ...c })),
    cryptoWallets: initial.personal.cryptoWallets.map((w) => ({ ...w })),
    dividendsList: initial.personal.dividendsList.map((d) => ({ ...d })),
    otherInvestments: { total: initial.personal.otherInvestments.total, items: initial.personal.otherInvestments.items.map((i) => ({ ...i })) },
  }));
  const [personalSynced, setPersonalSynced] = useState(initial.personal.synced);
  const [personalSyncing, setPersonalSyncing] = useState(false);
  const [personalWallets, setPersonalWallets] = useState<PersonalWalletRow[]>(initial.personal.personalWallets.map((w) => ({ ...w })));
  const [capitalHistory] = useState<SnapshotPoint[]>(initial.personal.capitalHistory.map((p) => ({ ...p })));
  const [cryptoHistory] = useState<SnapshotPoint[]>(initial.personal.cryptoHistory.map((p) => ({ ...p })));
  const [tonNumberRate] = useState<TonNumberRate>({ ...initial.personal.tonNumberRate });
  const [usdRub] = useState<number>(initial.personal.usdRub);

  const [reserves, setReserves] = useState<Reserves>(initial.company.reserves);
  const [agencies, setAgencies] = useState<Agency[]>(initial.company.agencies.map((a) => ({ ...a })));
  const [wallets, setWallets] = useState<Wallet[]>(initial.company.wallets.map((w) => ({ ...w })));
  const [payable] = useState<CompanyPayable>({ ...initial.company.payable, partners: initial.company.payable.partners.map((p) => ({ ...p })) });
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
      // TON numbers are auto-priced — kick a sync so the value (and rate badge)
      // appear immediately, then reload to pick up the server-priced figures.
      if (a.symbol === "TONNUM") {
        fetch("/api/sync/tonnums", { method: "POST" })
          .then((r) => r.json().catch(() => ({})))
          .then((s) => {
            if (s && s.ok) window.location.reload();
          })
          .catch(() => {});
      }
    });
  }, []);

  const setAssetAmount = useCallback(
    (id: string, amount: number) => {
      const unit = tonNumberRate.usd;
      setStore((prev) => ({
        ...prev,
        assets: prev.assets.map((x) => (x.id === id ? { ...x, amount, value: unit > 0 ? Math.round(amount * unit) : x.value } : x)),
      }));
      api("PATCH", `/api/assets/${id}`, { amount });
    },
    [tonNumberRate.usd]
  );

  const setAssetNative = useCallback(
    (id: string, nativeValue: number) => {
      const rate = usdRub;
      setStore((prev) => ({
        ...prev,
        assets: prev.assets.map((x) =>
          x.id === id ? { ...x, currency: "RUB", nativeValue, value: rate > 0 ? Math.round(nativeValue / rate) : x.value } : x
        ),
      }));
      api("PATCH", `/api/assets/${id}`, { nativeValue });
    },
    [usdRub]
  );

  const addDividend = useCallback((d: Dividend) => {
    setStore((prev) => {
      const dividendsList = [d, ...prev.dividendsList];
      return { ...prev, dividendsList, flows: { ...prev.flows, dividends: { value: dividendsList.reduce((s, x) => s + x.amount, 0) } } };
    });
    api("POST", "/api/dividends", d);
  }, []);

  const deleteAsset = useCallback((id: string) => {
    setStore((prev) => ({ ...prev, assets: prev.assets.filter((x) => x.id !== id) }));
    api("DELETE", `/api/assets/${id}`, undefined);
  }, []);

  const addPersonalWallet = useCallback(
    (w: { address: string; chain: string; label: string }) => {
      const tempId = "tmp-" + Date.now();
      setPersonalWallets((prev) => [
        ...prev,
        { id: tempId, chain: w.chain, label: w.label || `${w.chain} ${w.address.slice(0, 6)}`, address: w.address, balanceUsd: 0, synced: "ожидает синхронизации" },
      ]);
      toast("Адрес добавлен · синхронизирую баланс…");
      api("POST", "/api/wallets", w).then((res) => {
        // Trigger an immediate sync so the new balance appears, then reload.
        fetch("/api/sync/crypto", { method: "POST" })
          .then((r) => r.json().catch(() => ({})))
          .then((s) => {
            if (s && s.ok) window.location.reload();
          })
          .catch(() => {});
        if (res?.id) setPersonalWallets((prev) => prev.map((x) => (x.id === tempId ? { ...x, id: res.id } : x)));
      });
    },
    [toast]
  );

  const deletePersonalWallet = useCallback((id: string) => {
    setPersonalWallets((prev) => prev.filter((x) => x.id !== id));
    api("DELETE", `/api/wallets/${id}`, undefined);
  }, []);

  const addCompanyWallet = useCallback(
    (w: { address: string; label: string; group: "clean" | "dirty"; kind: "main" | "small"; chain?: "TRX" | "ETH" | "BSC" }) => {
      const tempId = "tmp-" + Date.now();
      setWallets((prev) => [
        ...prev,
        { id: tempId, label: w.label || w.address.slice(0, 8), addr: w.address, balance: 0, type: w.kind, group: w.group, synced: "ожидает синхронизации" },
      ]);
      api("POST", "/api/company/wallets", w).then((res) => {
        if (res?.id) setWallets((prev) => prev.map((x) => (x.id === tempId ? { ...x, id: res.id } : x)));
      });
      toast("Кошелёк добавлен · баланс подтянется при синхронизации");
    },
    [toast]
  );

  const deleteCompanyWallet = useCallback((id: string) => {
    setWallets((prev) => prev.filter((x) => x.id !== id));
    api("DELETE", `/api/company/wallets/${id}`, undefined);
  }, []);

  const addAgency = useCallback(
    (a: { platform: string; name: string; balance: number; by: string }) => {
      const tempId = "tmp-" + Date.now();
      setAgencies((prev) => [...prev, { id: tempId, platform: a.platform, name: a.name, balance: a.balance, updated: "только что", staleDays: 0, by: a.by }]);
      api("POST", "/api/agencies", a).then((res) => {
        if (res?.id) setAgencies((prev) => prev.map((x) => (x.id === tempId ? { ...x, id: res.id } : x)));
      });
    },
    []
  );

  const deleteAgency = useCallback((id: string) => {
    setAgencies((prev) => prev.filter((x) => x.id !== id));
    api("DELETE", `/api/agencies/${id}`, undefined);
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
    fetch("/api/sync/crypto", { method: "POST" })
      .then((r) => r.json().catch(() => ({})))
      .then((res) => {
        setCompanySyncing(false);
        setCompanySynced("только что");
        if (res && res.ok) {
          window.location.reload();
        } else {
          toast("Синхронизация недоступна (нет доступа к блокчейну)");
        }
      })
      .catch(() => {
        setCompanySyncing(false);
        toast("Не удалось синхронизировать");
      });
  }, [toast]);

  const walletsTotal = useMemo(() => wallets.reduce((s, w) => s + w.balance, 0), [wallets]);
  const compute = useCallback((): CompanyComputed => {
    const agenciesTotal = agencies.reduce((s, a) => s + a.balance, 0);
    const salaryReserve = reserves.salaryWeekly * reserves.salaryWeeks;
    const agencyReserve = reserves.agencyReserve;
    const payableTotal = payable.total;
    const total = walletsTotal + agenciesTotal;
    const available = total - salaryReserve - reserves.tech - agencyReserve - payableTotal;
    return { walletsTotal, agenciesTotal, salaryReserve, agencyReserve, payable: payableTotal, total, available };
  }, [agencies, reserves, walletsTotal, payable.total]);

  const value: AppState = {
    store,
    personalTotal,
    capitalHistory,
    cryptoHistory,
    addAsset,
    addDividend,
    deleteAsset,
    setAssetAmount,
    setAssetNative,
    tonNumberRate,
    usdRub,
    personalWallets,
    addPersonalWallet,
    deletePersonalWallet,
    personalSynced,
    refreshPersonal,
    personalSyncing,
    wallets,
    addCompanyWallet,
    deleteCompanyWallet,
    history,
    reserves,
    setReserve,
    resetReserves,
    agencies,
    setAgencyBalance,
    addAgency,
    deleteAgency,
    payable,
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
