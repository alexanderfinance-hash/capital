/* Live data providers for crypto balances (BTC/EVM/TRON/TON) and prices (CMC).
 * Each balance fetcher returns holdings in token units; failures return [] so a
 * single unreachable chain doesn't break the whole sync. Network access to these
 * hosts is required (works on an open network; blocked in restricted sandboxes). */
import "server-only";

export interface Holding {
  symbol: string;
  amount: number; // token units (e.g. BTC, ETH, USDT)
}
export interface Price {
  usd: number;
  change24h: number;
}

const TIMEOUT = 12000;
const signal = () => AbortSignal.timeout(TIMEOUT);

/* ---------- Bitcoin (Blockstream / mempool.space) ---------- */
export async function fetchBtc(address: string): Promise<Holding[]> {
  try {
    const base = process.env.BTC_API_URL || "https://blockstream.info/api";
    const res = await fetch(`${base}/address/${address}`, { signal: signal() });
    if (!res.ok) return [];
    const j: any = await res.json();
    const funded = j?.chain_stats?.funded_txo_sum ?? 0;
    const spent = j?.chain_stats?.spent_txo_sum ?? 0;
    const sats = funded - spent;
    return sats > 0 ? [{ symbol: "BTC", amount: sats / 1e8 }] : [];
  } catch {
    return [];
  }
}

/* ---------- EVM (JSON-RPC): native ETH + USDT/USDC via balanceOf ---------- */
const EVM_TOKENS: { symbol: string; contract: string; decimals: number }[] = [
  { symbol: "USDT", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "USDC", contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
];

async function rpc(method: string, params: unknown[]): Promise<string | null> {
  const url = process.env.EVM_RPC_URL || "https://eth.llamarpc.com";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: signal(),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    return j?.result ?? null;
  } catch {
    return null;
  }
}

export async function fetchEvm(address: string): Promise<Holding[]> {
  const out: Holding[] = [];
  const wei = await rpc("eth_getBalance", [address, "latest"]);
  if (wei) {
    const eth = Number(BigInt(wei)) / 1e18;
    if (eth > 0) out.push({ symbol: "ETH", amount: eth });
  }
  for (const t of EVM_TOKENS) {
    const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
    const hex = await rpc("eth_call", [{ to: t.contract, data }, "latest"]);
    if (hex && hex !== "0x") {
      const amt = Number(BigInt(hex)) / 10 ** t.decimals;
      if (amt > 0) out.push({ symbol: t.symbol, amount: amt });
    }
  }
  return out;
}

/* ---------- TRON (TronGrid): native TRX + USDT-TRC20 ---------- */
const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
export async function fetchTron(address: string): Promise<Holding[]> {
  try {
    const base = process.env.TRONGRID_API_URL || "https://api.trongrid.io";
    const headers: Record<string, string> = {};
    if (process.env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
    const res = await fetch(`${base}/v1/accounts/${address}`, { headers, signal: signal() });
    if (!res.ok) return [];
    const j: any = await res.json();
    const acc = j?.data?.[0];
    if (!acc) return [];
    const out: Holding[] = [];
    if (acc.balance) out.push({ symbol: "TRX", amount: acc.balance / 1e6 });
    for (const t of acc.trc20 || []) {
      const amt = t[TRON_USDT];
      if (amt) out.push({ symbol: "USDT", amount: Number(amt) / 1e6 });
    }
    return out;
  } catch {
    return [];
  }
}

/* ---------- TON (toncenter): native TON ---------- */
export async function fetchTon(address: string): Promise<Holding[]> {
  try {
    const base = process.env.TON_API_URL || "https://toncenter.com/api/v2";
    const key = process.env.TON_API_KEY ? `&api_key=${process.env.TON_API_KEY}` : "";
    const res = await fetch(`${base}/getAddressInformation?address=${encodeURIComponent(address)}${key}`, { signal: signal() });
    if (!res.ok) return [];
    const j: any = await res.json();
    const nano = Number(j?.result?.balance ?? 0);
    return nano > 0 ? [{ symbol: "TON", amount: nano / 1e9 }] : [];
  } catch {
    return [];
  }
}

/* ---------- Prices (CoinMarketCap) ---------- */
export async function getPrices(symbols: string[]): Promise<Map<string, Price>> {
  const out = new Map<string, Price>();
  const key = process.env.CMC_API_KEY;
  const list = [...new Set(symbols)].filter(Boolean);
  if (!key || !list.length) return out;
  const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${list.join(",")}&convert=USD`;
  const res = await fetch(url, { headers: { "X-CMC_PRO_API_KEY": key }, signal: signal() });
  if (!res.ok) throw new Error("CMC " + res.status);
  const j: any = await res.json();
  for (const s of list) {
    const d = j?.data?.[s];
    const q = Array.isArray(d) ? d[0]?.quote?.USD : d?.quote?.USD;
    if (q) out.set(s, { usd: q.price, change24h: q.percent_change_24h ?? 0 });
  }
  return out;
}

export interface CryptoProviders {
  BTC: (a: string) => Promise<Holding[]>;
  ETH: (a: string) => Promise<Holding[]>;
  TRX: (a: string) => Promise<Holding[]>;
  TON: (a: string) => Promise<Holding[]>;
  prices: (s: string[]) => Promise<Map<string, Price>>;
}

export const defaultProviders: CryptoProviders = {
  BTC: fetchBtc,
  ETH: fetchEvm,
  TRX: fetchTron,
  TON: fetchTon,
  prices: getPrices,
};
