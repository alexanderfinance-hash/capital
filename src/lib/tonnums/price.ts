/* TON anonymous-number unit price provider.
 *
 * Pulls the live rate of one anonymous TON (+888) number from nums888.io and
 * returns it in USD. The marketplace quotes the rate in TON, so by default the
 * parsed figure is converted to USD using the TON spot price (same CMC feed as
 * the crypto sync). On a hard failure (network down, non-2xx, price not found)
 * the fetcher THROWS so the sync layer can keep the last known cached price
 * instead of zeroing it (PRD §7). Network access to nums888.io is required
 * (works on an open network; blocked in restricted sandboxes).
 *
 * Configuration (all optional — sensible defaults if empty):
 *   NUMS888_URL              page/endpoint to read (default https://nums888.io/)
 *   NUMS888_PRICE_REGEX      regex with ONE capture group for the numeric rate
 *   NUMS888_PRICE_CURRENCY   "ton" (default) | "usd" — currency of the parsed rate
 *   TONNUM_PRICE_USD         hard override in USD (skips the network entirely)
 */
import "server-only";

const TIMEOUT = 12000;
const UA = "Mozilla/5.0 (compatible; CapitalDashboard/1.0; +https://nums888.io)";

export interface TonNumberRate {
  usd: number; // price of one anonymous TON number in USD
  ton: number | null; // price in TON, when known
  source: string; // "override" | "nums888"
}

// Default heuristic: the first number that reads like a TON price — i.e. is
// adjacent to a TON marker (💎 / "TON" / "тон"). JS `\s` already covers the
// nbsp / narrow-nbsp thousands separators these marketplaces use; a decimal
// comma is normalised in parseNumber().
const DEFAULT_REGEX = /([0-9][0-9\s.,]*)\s*(?:💎|ton\b|тон)/i;

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : NaN;
}

/** Fetch the current price of one anonymous TON number, in USD.
 *  `tonUsd` is the TON spot price, used to convert a TON-denominated rate. */
export async function fetchTonNumberRate(tonUsd?: number): Promise<TonNumberRate> {
  // Manual pin: skip the network entirely (useful if scraping is unreliable).
  const override = Number(process.env.TONNUM_PRICE_USD);
  if (override > 0) return { usd: override, ton: tonUsd && tonUsd > 0 ? override / tonUsd : null, source: "override" };

  const url = process.env.NUMS888_URL || "https://nums888.io/";
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/json" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error("nums888 " + res.status);
  const body = await res.text();

  const re = process.env.NUMS888_PRICE_REGEX ? new RegExp(process.env.NUMS888_PRICE_REGEX, "i") : DEFAULT_REGEX;
  const m = body.match(re);
  if (!m || !m[1]) throw new Error("nums888 price not found");
  const value = parseNumber(m[1]);
  if (!isFinite(value) || value <= 0) throw new Error("nums888 bad price");

  const currency = (process.env.NUMS888_PRICE_CURRENCY || "ton").toLowerCase();
  if (currency === "usd") return { usd: value, ton: tonUsd && tonUsd > 0 ? value / tonUsd : null, source: "nums888" };

  // TON-denominated rate → convert to USD via the TON spot price.
  if (!tonUsd || tonUsd <= 0) throw new Error("no TON spot price for TON→USD conversion");
  return { usd: value * tonUsd, ton: value, source: "nums888" };
}
