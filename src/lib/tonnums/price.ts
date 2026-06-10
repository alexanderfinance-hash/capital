/* TON anonymous-number unit price provider.
 *
 * Returns the live rate of one anonymous TON (+888) number in USD, scraped from
 * nums888.io. That page is server-rendered with the current rate right in its
 * <title> ("$2788.50 | Telegram Anonymous Numbers"), so we read the USD figure
 * straight from there — no marketplace API, no TON→USD conversion.
 *
 * On a hard failure (network/HTTP error, price not found) the fetcher THROWS so
 * the sync layer keeps the last known cached price instead of zeroing it
 * (PRD §7). nums888.io must be reachable from the server (it is from the VPS;
 * blocked in this sandbox).
 *
 * Configuration (all optional — sensible defaults if empty):
 *   TONNUM_PRICE_USD     hard override in USD per number (skips the network)
 *   NUMS888_URL          page to read (default https://nums888.io/)
 *   NUMS888_PRICE_REGEX  regex with ONE capture group for the USD figure
 */
import "server-only";

const TIMEOUT = 12000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// A dollar amount: "$2788.50", "$2,788.50", "$ 2788". Thousands separators
// (comma / space / nbsp — \s covers nbsp) are stripped in parseNumber().
const DEFAULT_PRICE_RE = /\$\s*([0-9][0-9.,\s]*)/;

export interface TonNumberRate {
  usd: number; // price of one anonymous number in USD
  ton: number | null;
  change24h: number | null;
  source: string; // "override" | "nums888"
  debug?: string;
}

function parseNumber(raw: string): number {
  // Keep the decimal point; drop thousands separators (commas/spaces/nbsp).
  const cleaned = raw.replace(/[,\s]/g, "").trim();
  const n = Number(cleaned);
  return isFinite(n) ? n : NaN;
}

export async function fetchTonNumberRate(): Promise<TonNumberRate> {
  // Manual pin: skip the network entirely.
  const override = Number(process.env.TONNUM_PRICE_USD);
  if (override > 0) return { usd: override, ton: null, change24h: null, source: "override" };

  const url = process.env.NUMS888_URL || "https://nums888.io/";
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    signal: AbortSignal.timeout(TIMEOUT),
  });
  if (!res.ok) throw new Error("nums888 " + res.status);
  const body = await res.text();

  const re = process.env.NUMS888_PRICE_REGEX ? new RegExp(process.env.NUMS888_PRICE_REGEX, "i") : DEFAULT_PRICE_RE;
  // The <title> carries the headline rate; prefer it, then fall back to the body.
  const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  const m = title.match(re) ?? body.match(re);
  if (!m || !m[1]) throw new Error("nums888 price not found (title=" + JSON.stringify(title.slice(0, 80)) + ")");
  const usd = parseNumber(m[1]);
  if (!isFinite(usd) || usd <= 0) throw new Error("nums888 bad price: " + JSON.stringify(m[1]));

  return { usd, ton: null, change24h: null, source: "nums888", debug: `title=${JSON.stringify(title.slice(0, 60))}` };
}
