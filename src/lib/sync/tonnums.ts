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

/** Symbol used for the TON-number unit price (PriceCache) and on TON-number assets. */
export const TONNUM_SYMBOL = "TONNUM";
/** Якорь суточной дельты: цена одного номера на начало текущих UTC-суток. Отдельная
 *  строка PriceCache, обновляется не чаще раза в сутки. Нужна, чтобы процент считался
 *  «сегодня против вчера» (как 24h у крипты), а не «против прошлого часа» — иначе при
 *  стабильной за час цене дельта всегда округляется в 0% (nums888 не отдаёт 24h). */
const TONNUM_REF_SYMBOL = "TONNUM_D1";

/** UTC-дата "YYYY-MM-DD" — по ней определяем смену суток для якоря. */
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface TonNumSyncResult {
  unitUsd: number;
  ton: number | null;
  source: string;
  assetsUpdated: number;
}

export async function syncTonNumbers(): Promise<TonNumSyncResult> {
  // Throws on failure → nothing below runs, last known data is preserved.
  const rate = await fetchTonNumberRate();
  const now = new Date();

  // Текущая (ещё не перезаписанная) цена и якорь начала суток.
  const [cur, ref] = await Promise.all([
    prisma.priceCache.findUnique({ where: { symbol: TONNUM_SYMBOL } }),
    prisma.priceCache.findUnique({ where: { symbol: TONNUM_REF_SYMBOL } }),
  ]);
  const curUsd = cur ? Number(cur.usd) : 0;

  // Якорь суточной дельты: цена на начало текущих UTC-суток. Обновляем раз в сутки —
  // при смене дня берём последнюю известную цену прошлого дня (curUsd), чтобы процент
  // считался «сегодня против вчера», а внутри дня оставался стабильным.
  let refUsd = ref ? Number(ref.usd) : 0;
  const dayRolled = !ref || utcDayKey(ref.fetchedAt) !== utcDayKey(now);
  if (dayRolled) {
    refUsd = curUsd > 0 ? curUsd : rate.usd; // первый запуск: якорь = текущая → дельта 0 до следующих суток
    await prisma.priceCache.upsert({
      where: { symbol: TONNUM_REF_SYMBOL },
      update: { usd: refUsd, fetchedAt: now },
      create: { symbol: TONNUM_REF_SYMBOL, usd: refUsd, fetchedAt: now },
    });
  }

  // Суточная дельта в %: (текущая − начало суток) / начало суток. Если провайдер даёт
  // готовое 24h-изменение — предпочитаем его.
  const deltaPct = rate.change24h != null ? rate.change24h : refUsd > 0 ? Math.round(((rate.usd - refUsd) / refUsd) * 1000) / 10 : 0;

  await prisma.priceCache.upsert({
    where: { symbol: TONNUM_SYMBOL },
    update: { usd: rate.usd, fetchedAt: now },
    create: { symbol: TONNUM_SYMBOL, usd: rate.usd, fetchedAt: now },
  });

  // Re-value every TON-number asset: value = quantity × unit price.
  const assets = await prisma.asset.findMany({ where: { symbol: TONNUM_SYMBOL } });
  let totalQty = 0;
  for (const a of assets) {
    const qty = a.amount === null ? 0 : Number(a.amount);
    totalQty += qty;
    await prisma.asset.update({
      where: { id: a.id },
      data: { value: Math.round(qty * rate.usd), delta: deltaPct },
    });
  }

  // Посуточный снимок стоимости TON-номеров — синтетический ряд в WalletDailySnapshot
  // (walletId "tonnum"), чтобы у номеров была история для графика «по монетам». Из
  // журнала движений по кошелькам этот ряд исключается (symbol TONNUM фильтруется).
  const snapDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  await prisma.walletDailySnapshot.upsert({
    where: { walletId_symbol_day: { walletId: "tonnum", symbol: TONNUM_SYMBOL, day: snapDay } },
    update: { amount: totalQty, usd: Math.round(totalQty * rate.usd), label: "TON номера", address: "—", chain: "TON" },
    create: { walletId: "tonnum", symbol: TONNUM_SYMBOL, day: snapDay, amount: totalQty, usd: Math.round(totalQty * rate.usd), label: "TON номера", address: "—", chain: "TON" },
  });

  await prisma.syncState.upsert({
    where: { source: "tonnums" },
    update: { lastSyncedAt: new Date(), ok: true },
    create: { source: "tonnums", lastSyncedAt: new Date(), ok: true },
  });

  return { unitUsd: rate.usd, ton: rate.ton, source: rate.source, assetsUpdated: assets.length };
}
