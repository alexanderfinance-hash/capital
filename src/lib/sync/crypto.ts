/* Sync crypto from wallet addresses in the DB:
 *  - personal: aggregate by coin → per-coin Assets (with amount) + CoinAllocation
 *  - company:  per-wallet USDT-TRC20 balance → Wallet.balanceUsd
 * Prices via CMC. Providers are injectable for testing; defaults hit live APIs. */
import "server-only";
import { prisma } from "../prisma";
import { defaultProviders, type CryptoProviders, type Holding } from "../crypto/providers";

const COIN_META: Record<string, { name: string; icon: string }> = {
  BTC: { name: "Bitcoin", icon: "coins" },
  ETH: { name: "Ethereum", icon: "coins" },
  BNB: { name: "BNB", icon: "coins" },
  TRX: { name: "Tron", icon: "coins" },
  TON: { name: "Toncoin", icon: "coins" },
  USDT: { name: "USDT", icon: "wallet" },
  USDC: { name: "USDC", icon: "wallet" },
};

export interface CryptoSyncResult {
  coins: { symbol: string; amount: number; usd: number }[];
  totalUsd: number;
  pricedSymbols: string[];
  wallets: { address: string; chain: string; scope: string; holdings: Holding[]; usd: number }[];
}

// Last known holdings persisted on the wallet (used when a live fetch fails so
// we keep the previous balance instead of zeroing it — PRD §7).
function lastKnownHoldings(holdingsJson: unknown): Holding[] {
  if (!Array.isArray(holdingsJson)) return [];
  return holdingsJson
    .map((h: any) => ({ symbol: String(h?.symbol || ""), amount: Number(h?.amount || 0) }))
    .filter((h) => h.symbol && h.amount > 0);
}

export async function syncCrypto(providers: CryptoProviders = defaultProviders): Promise<CryptoSyncResult> {
  const wallets = await prisma.wallet.findMany();

  // 1) Fetch holdings per wallet. On a fetch failure we fall back to the last
  //    known holdings and mark the wallet `stale` so persistence skips it.
  const fetched: { id: string; scope: string; chain: string; address: string; holdings: Holding[]; stale: boolean }[] = [];
  const personalBySymbol = new Map<string, number>();
  const allSymbols = new Set<string>();
  for (const w of wallets) {
    const fetcher = providers[w.chain as keyof CryptoProviders] as ((a: string) => Promise<Holding[]>) | undefined;
    let holdings: Holding[];
    let stale = false;
    if (typeof fetcher !== "function") {
      holdings = lastKnownHoldings(w.holdingsJson);
      stale = true;
    } else {
      try {
        holdings = await fetcher(w.address);
      } catch {
        holdings = lastKnownHoldings(w.holdingsJson);
        stale = true;
      }
    }
    fetched.push({ id: w.id, scope: w.scope, chain: w.chain, address: w.address, holdings, stale });
    for (const h of holdings) {
      allSymbols.add(h.symbol);
      if (w.scope === "personal") personalBySymbol.set(h.symbol, (personalBySymbol.get(h.symbol) || 0) + h.amount);
    }
  }

  // 2) Prices for everything we found. If prices are unreachable, keep existing data.
  const symbols = [...allSymbols];
  let prices = new Map();
  try {
    prices = symbols.length ? await providers.prices(symbols) : new Map();
  } catch {
    prices = new Map();
  }
  const usdOf = (h: Holding) => h.amount * (prices.get(h.symbol)?.usd || 0);

  // 3) Personal per-coin aggregates.
  const coins = [...personalBySymbol.keys()]
    .map((symbol) => {
      const amount = personalBySymbol.get(symbol) || 0;
      return { symbol, amount, usd: amount * (prices.get(symbol)?.usd || 0) };
    })
    .filter((c) => c.usd > 0)
    .sort((a, b) => b.usd - a.usd);
  const totalCrypto = coins.reduce((s, c) => s + c.usd, 0);

  const walletsDebug = fetched.map((f) => ({
    address: f.address,
    chain: f.chain,
    scope: f.scope,
    holdings: f.holdings,
    usd: f.holdings.reduce((s, h) => s + usdOf(h), 0),
  }));

  // Safety: nothing fetched/priced (e.g. network blocked) → keep existing data.
  if (symbols.length === 0 || prices.size === 0) {
    return { coins: [], totalUsd: 0, pricedSymbols: [...prices.keys()], wallets: walletsDebug };
  }

  // 4) Persist.
  await prisma.$transaction(async (tx) => {
    // per-wallet balances (both contours) + per-coin breakdown.
    // Stale wallets (live fetch failed) keep their previous balance and lastSyncedAt.
    for (const f of fetched) {
      if (f.stale) continue;
      const usd = f.holdings.reduce((s, h) => s + usdOf(h), 0);
      const native = f.holdings[0]?.amount ?? 0;
      const holdingsJson = f.holdings.map((h) => ({ symbol: h.symbol, amount: h.amount, usd: usdOf(h) }));
      await tx.wallet.update({ where: { id: f.id }, data: { balance: native, balanceUsd: usd, holdingsJson, lastSyncedAt: new Date() } });
    }

    // personal per-coin synced assets (replace previous synced crypto assets)
    await tx.asset.deleteMany({ where: { source: "sync", bucket: "crypto" } });
    for (const c of coins) {
      const meta = COIN_META[c.symbol] || { name: c.symbol, icon: "coins" };
      await tx.asset.create({
        data: {
          slug: "coin-" + c.symbol,
          icon: meta.icon,
          name: meta.name,
          value: Math.round(c.usd),
          amount: c.amount,
          symbol: c.symbol,
          delta: Math.round((prices.get(c.symbol)?.change24h || 0) * 10) / 10,
          source: "sync",
          bucket: "crypto",
        },
      });
    }

    // coin allocation
    await tx.coinAllocation.deleteMany();
    for (const c of coins) {
      await tx.coinAllocation.create({ data: { ticker: c.symbol, pct: totalCrypto ? Math.round((c.usd / totalCrypto) * 100) : 0 } });
    }

    // capital snapshot (personal total = all assets)
    const allAssets = await tx.asset.findMany();
    const personalTotal = allAssets.reduce((s, a) => s + Number(a.value), 0);
    await tx.capitalSnapshot.create({ data: { scope: "personal", value: personalTotal } });

    // company snapshot (wallets + agencies)
    const companyWallets = await tx.wallet.findMany({ where: { scope: "company" } });
    const agencies = await tx.agency.findMany();
    const companyTotal =
      companyWallets.reduce((s, w) => s + Number(w.balanceUsd), 0) + agencies.reduce((s, a) => s + Number(a.balance), 0);
    if (companyWallets.length || agencies.length) {
      await tx.capitalSnapshot.create({ data: { scope: "company", value: companyTotal } });
    }

    await tx.syncState.upsert({
      where: { source: "crypto" },
      update: { lastSyncedAt: new Date(), ok: true },
      create: { source: "crypto", lastSyncedAt: new Date(), ok: true },
    });
  });

  return { coins, totalUsd: Math.round(totalCrypto), pricedSymbols: [...prices.keys()], wallets: walletsDebug };
}
