/* Server-side data layer: reads from Postgres and shapes records into the
 * structures the UI expects. Falls back to mock data when the DB is
 * unreachable (so `npm run dev` works without Postgres). */
import "server-only";
import { prisma } from "./prisma";
import { initialStore, WALLETS, AGENCIES, HISTORY, DEFAULT_RESERVES } from "./mockData";
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
} from "./types";

const num = (v: unknown): number => Number(v as never);

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
    synced: "Обновлено только что",
  };
}

function companyFallback(): CompanyData {
  return {
    wallets: WALLETS.map((w) => ({ ...w })),
    agencies: AGENCIES.map((a) => ({ ...a })),
    reserves: { ...DEFAULT_RESERVES },
    history: HISTORY.map((h) => ({ ...h })),
    synced: "2 мин назад",
  };
}

export async function getPersonalData(): Promise<PersonalData> {
  try {
    const [assetRows, dividendRows, monthRows, coinRows, sync, allCats, allSubs, personalWalletRows] = await Promise.all([
      prisma.asset.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.dividend.findMany({ orderBy: { paidAt: "desc" } }),
      prisma.expenseMonth.findMany({ orderBy: { monthStart: "asc" } }),
      prisma.coinAllocation.findMany({ orderBy: { pct: "desc" } }),
      prisma.syncState.findUnique({ where: { source: "crypto" } }),
      prisma.expenseCategory.findMany({ orderBy: { value: "desc" } }),
      prisma.expenseSubcategory.findMany({ orderBy: { value: "desc" } }),
      prisma.wallet.findMany({ where: { scope: "personal" } }),
    ]);

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
    const cryptoWallets: { symbol: string; label: string; address: string; amount: number; usd: number }[] = [];
    for (const w of personalWalletRows) {
      const hs = Array.isArray(w.holdingsJson) ? (w.holdingsJson as any[]) : [];
      for (const h of hs) {
        if (h && h.symbol) cryptoWallets.push({ symbol: h.symbol, label: w.label, address: w.address, amount: Number(h.amount) || 0, usd: Number(h.usd) || 0 });
      }
    }

    const personalWallets = personalWalletRows.map((w) => ({
      id: w.slug ?? w.id,
      chain: w.chain as string,
      label: w.label,
      address: w.address,
      balanceUsd: num(w.balanceUsd),
      synced: relativeRu(w.lastSyncedAt),
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
      synced: `Обновлено ${relativeRu(sync?.lastSyncedAt ?? null)}`,
    };
  } catch {
    return personalFallback();
  }
}

export async function getCompanyData(): Promise<CompanyData> {
  try {
    const [walletRows, agencyRows, reserve, snapshots, sync] = await Promise.all([
      prisma.wallet.findMany({ where: { scope: "company" }, orderBy: { balanceUsd: "desc" } }),
      prisma.agency.findMany({ orderBy: { balance: "desc" } }),
      prisma.reserve.findUnique({ where: { id: "default" } }),
      prisma.capitalSnapshot.findMany({ where: { scope: "company" }, orderBy: { capturedAt: "asc" } }),
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
    }));

    const agencies: Agency[] = agencyRows.map((a) => {
      const { label, staleDays } = daysAgoRu(a.updatedAt);
      return { id: a.slug ?? a.id, platform: a.platform, name: a.name, balance: num(a.balance), updated: label, staleDays, by: a.enteredBy };
    });

    return {
      wallets,
      agencies,
      reserves: reserve
        ? { salaryWeekly: reserve.salaryWeekly, salaryWeeks: reserve.salaryWeeks, tech: reserve.tech }
        : { ...DEFAULT_RESERVES },
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
