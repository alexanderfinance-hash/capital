/* Sync personal crypto: read wallet addresses from DB, fetch on-chain balances,
 * price them (CMC), and write per-coin Assets + CoinAllocation + a capital
 * snapshot. Providers are injectable for testing; defaults hit live APIs. */
import "server-only";
import { prisma } from "../prisma";
import { defaultProviders, type CryptoProviders, type Holding } from "../crypto/providers";

const COIN_META: Record<string, { name: string; icon: string }> = {
  BTC: { name: "Bitcoin", icon: "coins" },
  ETH: { name: "Ethereum", icon: "coins" },
  TRX: { name: "Tron", icon: "coins" },
  TON: { name: "Toncoin", icon: "coins" },
  USDT: { name: "USDT", icon: "wallet" },
  USDC: { name: "USDC", icon: "wallet" },
};

export interface CryptoSyncResult {
  coins: { symbol: string; amount: number; usd: number }[];
  totalUsd: number;
  pricedSymbols: string[];
}

export async function syncCrypto(providers: CryptoProviders = defaultProviders): Promise<CryptoSyncResult> {
  const wallets = await prisma.wallet.findMany({ where: { scope: "personal" } });

  // 1) Fetch holdings per wallet.
  const perWalletUsdInputs: { id: string; holdings: Holding[] }[] = [];
  const bySymbol = new Map<string, number>(); // symbol -> amount
  for (const w of wallets) {
    const fetcher = providers[w.chain as keyof CryptoProviders] as ((a: string) => Promise<Holding[]>) | undefined;
    const holdings = typeof fetcher === "function" ? await fetcher(w.address) : [];
    perWalletUsdInputs.push({ id: w.id, holdings });
    for (const h of holdings) bySymbol.set(h.symbol, (bySymbol.get(h.symbol) || 0) + h.amount);
  }

  // 2) Prices.
  const symbols = [...bySymbol.keys()];
  const prices = symbols.length ? await providers.prices(symbols) : new Map();

  const usdOfHolding = (h: Holding) => h.amount * (prices.get(h.symbol)?.usd || 0);

  // 3) Per-coin USD aggregates.
  const coins = symbols
    .map((symbol) => {
      const amount = bySymbol.get(symbol) || 0;
      const usd = amount * (prices.get(symbol)?.usd || 0);
      return { symbol, amount, usd };
    })
    .filter((c) => c.usd > 0)
    .sort((a, b) => b.usd - a.usd);
  const totalCrypto = coins.reduce((s, c) => s + c.usd, 0);

  // Safety: if nothing was fetched/priced (e.g. network blocked), keep existing
  // data instead of wiping it.
  if (coins.length === 0) {
    return { coins: [], totalUsd: 0, pricedSymbols: [...prices.keys()] };
  }

  // 4) Persist.
  await prisma.$transaction(async (tx) => {
    // per-wallet balances
    for (const w of perWalletUsdInputs) {
      const usd = w.holdings.reduce((s, h) => s + usdOfHolding(h), 0);
      const native = w.holdings[0]?.amount ?? 0;
      await tx.wallet.update({ where: { id: w.id }, data: { balance: native, balanceUsd: usd, lastSyncedAt: new Date() } });
    }

    // per-coin synced assets (replace previous synced crypto assets)
    await tx.asset.deleteMany({ where: { source: "sync", bucket: "crypto" } });
    for (const c of coins) {
      const meta = COIN_META[c.symbol] || { name: c.symbol, icon: "coins" };
      await tx.asset.create({
        data: {
          slug: "coin-" + c.symbol,
          icon: meta.icon,
          name: meta.name,
          value: Math.round(c.usd),
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

    await tx.syncState.upsert({
      where: { source: "crypto" },
      update: { lastSyncedAt: new Date(), ok: true },
      create: { source: "crypto", lastSyncedAt: new Date(), ok: true },
    });
  });

  return { coins, totalUsd: Math.round(totalCrypto), pricedSymbols: [...prices.keys()] };
}
