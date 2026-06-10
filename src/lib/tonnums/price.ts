/* TON anonymous-number unit price provider.
 *
 * Returns the live rate of one anonymous TON (+888) number in USD. An anonymous
 * number is an NFT in the "Anonymous Telegram Numbers" collection on TON, so the
 * rate is the collection's market FLOOR price. We read it from CoinGecko's NFT
 * API, which returns the floor directly in both USD and TON (plus 24h change) —
 * no HTML scraping, no manual TON→USD conversion.
 *
 * On a hard failure (network down, non-2xx, price missing) the fetcher THROWS
 * so the sync layer keeps the last known cached price instead of zeroing it
 * (PRD §7). Network access to api.coingecko.com is required (open network;
 * blocked in restricted sandboxes).
 *
 * Configuration (all optional — sensible defaults if empty):
 *   TONNUM_PRICE_USD          hard override in USD per number (skips the network)
 *   TONNUM_COINGECKO_NFT_ID   CoinGecko NFT id (default "anonymous-telegram-numbers")
 *   COINGECKO_API_URL         API base (default https://api.coingecko.com/api/v3;
 *                             for a Pro key use https://pro-api.coingecko.com/api/v3)
 *   COINGECKO_API_KEY         CoinGecko key (sent as x-cg-demo-api-key, or
 *                             x-cg-pro-api-key when COINGECKO_API_URL is the pro host)
 */
import "server-only";

const TIMEOUT = 12000;

export interface TonNumberRate {
  usd: number; // floor price of one number in USD
  ton: number | null; // floor price in TON, when known
  change24h: number | null; // 24h floor change %, when known
  source: string; // "override" | "coingecko"
}

export async function fetchTonNumberRate(): Promise<TonNumberRate> {
  // Manual pin: skip the network entirely (useful if the API is unreachable).
  const override = Number(process.env.TONNUM_PRICE_USD);
  if (override > 0) return { usd: override, ton: null, change24h: null, source: "override" };

  const base = (process.env.COINGECKO_API_URL || "https://api.coingecko.com/api/v3").replace(/\/$/, "");
  const id = process.env.TONNUM_COINGECKO_NFT_ID || "anonymous-telegram-numbers";

  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) {
    const header = base.includes("pro-api") ? "x-cg-pro-api-key" : "x-cg-demo-api-key";
    headers[header] = process.env.COINGECKO_API_KEY;
  }

  const res = await fetch(`${base}/nfts/${encodeURIComponent(id)}`, { headers, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error("coingecko nft " + res.status);
  const j: any = await res.json();

  const usd = Number(j?.floor_price?.usd);
  if (!isFinite(usd) || usd <= 0) throw new Error("coingecko nft floor missing");
  const tonRaw = Number(j?.floor_price?.native_currency);
  const changeRaw = Number(j?.floor_price_24h_percentage_change?.usd);

  return {
    usd,
    ton: isFinite(tonRaw) && tonRaw > 0 ? tonRaw : null,
    change24h: isFinite(changeRaw) ? Math.round(changeRaw * 10) / 10 : null,
    source: "coingecko",
  };
}
