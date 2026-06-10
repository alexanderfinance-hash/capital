/* USD→RUB rate provider with DB cache and graceful fallback.
 *
 * Primary source: Bank of Russia (cbr-xml-daily.ru archive by date).
 * If the network blocks it (or the date is missing), falls back to the last
 * cached rate, then to FX_USD_RUB from the environment. Returns RUB per 1 USD. */
import "server-only";
import { prisma } from "./prisma";

const FALLBACK = () => Number(process.env.FX_USD_RUB) || 95;

async function fetchCbr(dateISO: string): Promise<number | null> {
  // dateISO = "YYYY-MM-DD"
  const [y, m, d] = dateISO.split("-");
  const url = `https://www.cbr-xml-daily.ru/archive/${y}/${m}/${d}/daily_json.js`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json: any = await res.json();
    const v = json?.Valute?.USD?.Value;
    return typeof v === "number" && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Resolve USD→RUB rates for a set of dates ("YYYY-MM-DD"), using cache first. */
export async function getUsdRubRates(dates: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(dates)];
  const out = new Map<string, number>();

  const cached = await prisma.fxRate.findMany({ where: { date: { in: unique } } });
  const cachedMap = new Map(cached.map((c) => [c.date, Number(c.usdRub)]));

  // last known cached rate as a fallback anchor
  const lastKnown = await prisma.fxRate.findFirst({ orderBy: { date: "desc" } });
  const anchor = lastKnown ? Number(lastKnown.usdRub) : FALLBACK();

  for (const date of unique) {
    if (cachedMap.has(date)) {
      out.set(date, cachedMap.get(date)!);
      continue;
    }
    const live = await fetchCbr(date);
    const rate = live ?? anchor;
    out.set(date, rate);
    if (live) {
      await prisma.fxRate.upsert({
        where: { date },
        update: { usdRub: live, source: "cbr" },
        create: { date, usdRub: live, source: "cbr" },
      });
    }
  }
  return out;
}

export function fallbackRate(): number {
  return FALLBACK();
}

/** Current USD→RUB rate (RUB per 1 USD): today's CBR rate, cached, with the
 *  last-known / env fallback. Used to value RUB-denominated assets in USD. */
export async function getCurrentUsdRub(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const rates = await getUsdRubRates([today]);
  return rates.get(today) ?? fallbackRate();
}
