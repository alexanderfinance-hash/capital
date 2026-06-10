/* Sync the TON anonymous-number unit price from nums888.io and re-value every
 * personal "TON номера" asset (value = quantity × unit price). The unit price
 * is cached in PriceCache["TONNUM"] and shown next to the asset on the
 * dashboard. Resilience (PRD §7): if the fetch fails the function THROWS before
 * writing anything, so the last known cached price and asset values are kept
 * (the route surfaces the error; the "обновлено N назад" badge stays anchored
 * to the last successful sync). */
import "server-only";
import { prisma } from "../prisma";
import { fetchTonNumberRate } from "../tonnums/price";
import { defaultProviders, type CryptoProviders } from "../crypto/providers";

/** Symbol used for the TON-number unit price (PriceCache) and on TON-number assets. */
export const TONNUM_SYMBOL = "TONNUM";

export interface TonNumSyncResult {
  unitUsd: number;
  ton: number | null;
  source: string;
  assetsUpdated: number;
}

export async function syncTonNumbers(providers: CryptoProviders = defaultProviders): Promise<TonNumSyncResult> {
  // TON spot price for converting a TON-denominated marketplace rate to USD.
  // Best-effort: an explicit USD source/override doesn't need it.
  let tonUsd: number | undefined;
  try {
    const prices = await providers.prices(["TON"]);
    tonUsd = prices.get("TON")?.usd;
  } catch {
    /* keep tonUsd undefined; fetchTonNumberRate decides if it's required */
  }

  // Throws on failure → nothing below runs, last known data is preserved.
  const rate = await fetchTonNumberRate(tonUsd);

  // 24h-ish delta vs the previously cached unit price (best effort).
  const prev = await prisma.priceCache.findUnique({ where: { symbol: TONNUM_SYMBOL } });
  const prevUsd = prev ? Number(prev.usd) : 0;
  const deltaPct = prevUsd > 0 ? Math.round(((rate.usd - prevUsd) / prevUsd) * 1000) / 10 : 0;

  await prisma.priceCache.upsert({
    where: { symbol: TONNUM_SYMBOL },
    update: { usd: rate.usd, fetchedAt: new Date() },
    create: { symbol: TONNUM_SYMBOL, usd: rate.usd, fetchedAt: new Date() },
  });

  // Re-value every TON-number asset: value = quantity × unit price.
  const assets = await prisma.asset.findMany({ where: { symbol: TONNUM_SYMBOL } });
  for (const a of assets) {
    const qty = a.amount === null ? 0 : Number(a.amount);
    await prisma.asset.update({
      where: { id: a.id },
      data: { value: Math.round(qty * rate.usd), delta: deltaPct },
    });
  }

  await prisma.syncState.upsert({
    where: { source: "tonnums" },
    update: { lastSyncedAt: new Date(), ok: true },
    create: { source: "tonnums", lastSyncedAt: new Date(), ok: true },
  });

  return { unitUsd: rate.usd, ton: rate.ton, source: rate.source, assetsUpdated: assets.length };
}
