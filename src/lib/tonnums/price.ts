/* TON anonymous-number unit price provider.
 *
 * The rate of one anonymous TON (+888) number = the market FLOOR price of the
 * "Anonymous Telegram Numbers" NFT collection on TON. Getgems is the canonical
 * TON NFT marketplace (the same data third-party trackers like nums888.io show),
 * and exposes collection stats over a public GraphQL API. We read the floor from
 * there and convert TON→USD with the TON spot price (CMC, same feed as crypto).
 *
 * On a hard failure (network/HTTP error, floor missing) the fetcher THROWS so the
 * sync layer keeps the last known cached price instead of zeroing it (PRD §7).
 * Network access to api.getgems.io is required (open network; blocked in
 * restricted sandboxes).
 *
 * Configuration (all optional — sensible defaults if empty):
 *   TONNUM_PRICE_USD            hard override in USD per number (skips the network)
 *   TONNUM_COLLECTION_ADDRESS   TON collection address (default = Anonymous Numbers)
 *   GETGEMS_API_URL             GraphQL endpoint (default https://api.getgems.io/graphql)
 */
import "server-only";

const TIMEOUT = 12000;

// "Anonymous Telegram Numbers" collection on TON.
const DEFAULT_COLLECTION = "EQAOQdwdw8kGftJCSFgOErM1mBjYPe4DBPq8-AhF6vr9si5N";

// Getgems stats fields have used a couple of names over time; try each.
const STAT_FIELDS = ["nftCollectionStats", "alphaNftCollectionStats"];

export interface TonNumberRate {
  usd: number; // floor price of one number in USD
  ton: number | null; // floor price in TON
  change24h: number | null; // 24h floor change %, when known
  source: string; // "override" | "getgems"
  debug?: string; // short diagnostic (upstream shape/errors) for the debug endpoint
}

/** Floor figures come back as TON or as nanoton (1e9). Normalise to TON. */
function toTon(raw: unknown): number | null {
  const n = Number(raw);
  if (!isFinite(n) || n <= 0) return null;
  return n > 1e6 ? n / 1e9 : n; // big number ⇒ nanoton
}

async function queryGetgems(url: string, field: string, address: string): Promise<{ floorTon: number | null; body: string }> {
  const query = `query($a:String!){ ${field}(address:$a){ floorPrice } }`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // Browser-like headers: some marketplace edges reject bare requests.
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Origin: "https://getgems.io",
      Referer: "https://getgems.io/",
    },
    body: JSON.stringify({ query, variables: { a: address } }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const text = await res.text();
  if (!res.ok) return { floorTon: null, body: `HTTP ${res.status}: ${text.slice(0, 200)}` };
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { floorTon: null, body: `non-JSON: ${text.slice(0, 200)}` };
  }
  const floor = j?.data?.[field]?.floorPrice;
  return { floorTon: toTon(floor), body: text.slice(0, 200) };
}

/** Fetch the current floor price of one anonymous TON number, in USD.
 *  `tonUsd` is the TON spot price, used to convert the TON-denominated floor. */
export async function fetchTonNumberRate(tonUsd?: number): Promise<TonNumberRate> {
  // Manual pin: skip the network entirely (useful if the API is unreachable).
  const override = Number(process.env.TONNUM_PRICE_USD);
  if (override > 0) return { usd: override, ton: tonUsd && tonUsd > 0 ? override / tonUsd : null, change24h: null, source: "override" };

  const url = process.env.GETGEMS_API_URL || "https://api.getgems.io/graphql";
  const address = process.env.TONNUM_COLLECTION_ADDRESS || DEFAULT_COLLECTION;

  const tries: string[] = [];
  let floorTon: number | null = null;
  for (const field of STAT_FIELDS) {
    try {
      const r = await queryGetgems(url, field, address);
      tries.push(`${field}: ${r.floorTon != null ? r.floorTon + " TON" : r.body}`);
      if (r.floorTon != null) {
        floorTon = r.floorTon;
        break;
      }
    } catch (e) {
      tries.push(`${field}: ${String(e).slice(0, 120)}`);
    }
  }

  if (floorTon == null) throw new Error("getgems floor not found · " + tries.join(" | "));
  if (!tonUsd || tonUsd <= 0) throw new Error("no TON spot price for TON→USD conversion (floor=" + floorTon + " TON)");

  return { usd: floorTon * tonUsd, ton: floorTon, change24h: null, source: "getgems", debug: tries.join(" | ") };
}
