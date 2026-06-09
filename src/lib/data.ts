/* Server-side data layer: reads from Postgres and shapes records into the
 * structures the UI expects. Falls back to mock data when the DB is
 * unreachable (so `npm run dev` works without Postgres). */
import "server-only";
import { prisma } from "./prisma";
import { initialStore, WALLETS, AGENCIES, HISTORY, DEFAULT_RESERVES, CHARTS } from "./mockData";
import { relativeRu, daysAgoRu, dayMonthRu } from "./time";
import type {
  PersonalData,
  CompanyData,
  Asset,
  Wallet,
  Agency,
  DataSource,
  AssetBucket,
  WalletGroup,
  WalletType,
  SnapshotPoint,
} from "./types";

const num = (v: unknown): number => Number(v as never);

/** Build a fallback history series from a mock chart row (dev without DB only).
 *  Spaces points one day apart ending today so period filtering still works. */
function fallbackHistory(vals: number[]): SnapshotPoint[] {
  const now = Date.now();
  return vals.map((v, i) => {
    const d = new Date(now - (vals.length - 1 - i) * 86400000);
    return { t: d.toISOString(), label: dayMonthRu(d), value: v * 1000 };
  });
}

function personalFallback(): PersonalData {
  return {
    assets: initialStore.assets.map((a) => ({ ...a })),
    flows: { expenses: { ...initialStore.flows.expenses }, dividends: { ...initialStore.flows.dividends } },
    expenseCats: initialStore.expenseCats.map((c) => ({ ...c })),
    expensesByPeriod: { ...initialStore.expensesByPeriod },
    expenseSubs: {},
    expenseMonths: initialStore.expenseMonths.map((m) => ({ ...m })),
    coins: initialStore.coins.map((c) => ({ ...c })),
    cryptoWallets: [],
    personalWallets: [],
    dividendsList: initialStore.dividendsList.map((d) => ({ ...d })),
    capitalHistory: fallbackHistory(CHARTS["Г"].v),
    cryptoHistory: fallbackHistory(CHARTS["6М"].v),
    synced: "Обновлено только что",
  };
}

function companyFallback(): CompanyData {
  return {
    wallets: WALLETS.map((w) => ({ ...w })),
    agencies: AGENCIES.map((a) => ({ ...a })),
    reserves: { ...DEFAULT_RESERVES },
    payable: { total: 0, partners: [], synced: "ожидает синхронизации", staleDays: -1 },
    history: HISTORY.map((h) => ({ ...h })),
    synced: "2 мин назад",
  };
}

export async function getPersonalData(): Promise<PersonalData> {
  try {
    // History charts show up to ~13 months back (covers the 1Y period + margin).
    const historyFrom = new Date(Date.now() - 400 * 86400000);
    const [assetRows, dividendRows, monthRows, coinRows, sync, allCats, allSubs, personalWalletRows, capitalSnaps, cryptoSnaps] = await Promise.all([
      prisma.asset.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.dividend.findMany({ orderBy: { paidAt: "desc" } }),
      prisma.expenseMonth.findMany({ orderBy: { monthStart: "asc" } }),
      prisma.coinAllocation.findMany({ orderBy: { pct: "desc" } }),
      prisma.syncState.findUnique({ where: { source: "crypto" } }),
      prisma.expenseCategory.findMany({ orderBy: { value: "desc" } }),
      prisma.expenseSubcategory.findMany({ orderBy: { value: "desc" } }),
      prisma.wallet.findMany({ where: { scope: "personal" } }),
      prisma.capitalSnapshot.findMany({ where: { scope: "personal", capturedAt: { gte: historyFrom } }, orderBy: { capturedAt: "asc" } }),
      prisma.capitalSnapshot.findMany({ where: { scope: "crypto", capturedAt: { gte: historyFrom } }, orderBy: { capturedAt: "asc" } }),
    ]);

    const toPoints = (rows: { capturedAt: Date; value: unknown }[]): SnapshotPoint[] =>
      rows.map((s) => ({ t: s.capturedAt.toISOString(), label: dayMonthRu(s.capturedAt), value: num(s.value) }));

    const assets: Asset[] = assetRows.map((a) => ({
      id: a.slug ?? a.id,
      icon: a.icon,
      name: a.name,
      value: num(a.value),
      delta: a.delta === null ? null : num(a.delta),
      amount: a.amount === null ? null : num(a.amount),
      symbol: a.symbol ?? null,
      src: a.source as DataSource,
      bucket: a.bucket as AssetBucket,
    }));

    const months = monthRows.map((m) => ({ m: m.label, v: num(m.value), period: m.monthStart.toISOString().slice(0, 7) }));
    const lastV = months.length ? months[months.length - 1].v : 0;
    const prevV = months.length > 1 ? months[months.length - 2].v : lastV;
    const expensesDelta = prevV ? Math.round(((lastV - prevV) / prevV) * 100) : 0;

    // Categories grouped by period (for clickable month bars).
    const expensesByPeriod: Record<string, { name: string; value: number }[]> = {};
    for (const c of allCats) {
      (expensesByPeriod[c.period] ||= []).push({ name: c.name, value: num(c.value) });
    }
    const latestPeriod = months.length ? months[months.length - 1].period : "";
    const expenseCats = expensesByPeriod[latestPeriod] || [];

    // Subcategories grouped by period → parent (for the expandable tree).
    const expenseSubs: Record<string, Record<string, { name: string; value: number }[]>> = {};
    for (const s of allSubs) {
      ((expenseSubs[s.period] ||= {})[s.parent] ||= []).push({ name: s.name, value: num(s.value) });
    }

    // Per-wallet crypto breakdown (for the expandable coin list).
    const cryptoWallets: { symbol: string; chain: string; label: string; address: string; amount: number; usd: number }[] = [];
    for (const w of personalWalletRows) {
      const hs = Array.isArray(w.holdingsJson) ? (w.holdingsJson as any[]) : [];
      for (const h of hs) {
        if (h && h.symbol) cryptoWallets.push({ symbol: h.symbol, chain: w.chain as string, label: w.label, address: w.address, amount: Number(h.amount) || 0, usd: Number(h.usd) || 0 });
      }
    }

    const personalWallets = personalWalletRows.map((w) => ({
      id: w.slug ?? w.id,
      chain: w.chain as string,
      label: w.label,
      address: w.address,
      balanceUsd: num(w.balanceUsd),
      synced: relativeRu(w.lastSyncedAt),
      staleDays: w.lastSyncedAt ? daysAgoRu(w.lastSyncedAt).staleDays : -1,
    }));

    const dividendsList = dividendRows.map((d) => ({ date: dayMonthRu(d.paidAt), name: d.name, amount: num(d.amount) }));
    const dividendsTotal = dividendsList.reduce((s, d) => s + d.amount, 0);

    return {
      assets,
      flows: { expenses: { value: lastV, delta: expensesDelta }, dividends: { value: dividendsTotal } },
      expenseCats,
      expensesByPeriod,
      expenseSubs,
      expenseMonths: months,
      coins: coinRows.map((c) => ({ t: c.ticker, pct: c.pct })),
      cryptoWallets,
      personalWallets,
      dividendsList,
      capitalHistory: toPoints(capitalSnaps),
      cryptoHistory: toPoints(cryptoSnaps),
      synced: `Обновлено ${relativeRu(sync?.lastSyncedAt ?? null)}`,
    };
  } catch {
    return personalFallback();
  }
}

export async function getCompanyData(): Promise<CompanyData> {
  try {
    const [walletRows, agencyRows, reserve, payableRow, snapshots, sync] = await Promise.all([
      prisma.wallet.findMany({ where: { scope: "company" }, orderBy: { balanceUsd: "desc" } }),
      prisma.agency.findMany({ orderBy: { balance: "desc" } }),
      prisma.reserve.findUnique({ where: { id: "default" } }),
      prisma.coinlinkPayable.findUnique({ where: { id: "default" } }),
      // Company wallet history is shown year-to-date — from Jan 1 of the current year.
      prisma.capitalSnapshot.findMany({
        where: { scope: "company", capturedAt: { gte: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)) } },
        orderBy: { capturedAt: "asc" },
      }),
      prisma.syncState.findUnique({ where: { source: "crypto" } }),
    ]);

    const wallets: Wallet[] = walletRows.map((w) => ({
      id: w.slug ?? w.id,
      label: w.label,
      addr: w.address,
      balance: num(w.balanceUsd),
      type: (w.kind ?? "main") as WalletType,
      group: (w.group ?? "dirty") as WalletGroup,
      synced: relativeRu(w.lastSyncedAt),
      staleDays: w.lastSyncedAt ? daysAgoRu(w.lastSyncedAt).staleDays : -1,
    }));

    const agencies: Agency[] = agencyRows.map((a) => {
      const { label, staleDays } = daysAgoRu(a.updatedAt);
      return { id: a.slug ?? a.id, platform: a.platform, name: a.name, balance: num(a.balance), updated: label, staleDays, by: a.enteredBy };
    });

    const payablePartners = Array.isArray(payableRow?.partners)
      ? (payableRow!.partners as any[]).map((p) => ({ partner: String(p?.partner ?? "—"), debt: Number(p?.debt) || 0 }))
      : [];

    return {
      wallets,
      agencies,
      reserves: reserve
        ? { salaryWeekly: reserve.salaryWeekly, salaryWeeks: reserve.salaryWeeks, tech: reserve.tech }
        : { ...DEFAULT_RESERVES },
      payable: {
        total: payableRow ? num(payableRow.totalUsdt) : 0,
        partners: payablePartners,
        synced: relativeRu(payableRow?.lastSyncedAt ?? null),
        staleDays: payableRow?.lastSyncedAt ? daysAgoRu(payableRow.lastSyncedAt).staleDays : -1,
      },
      history: snapshots.map((s) => ({ week: dayMonthRu(s.capturedAt), value: num(s.value) })),
      synced: relativeRu(sync?.lastSyncedAt ?? null),
    };
  } catch {
    return companyFallback();
  }
}

export async function getInitialData() {
  const [personal, company] = await Promise.all([getPersonalData(), getCompanyData()]);
  return { personal, company };
}
