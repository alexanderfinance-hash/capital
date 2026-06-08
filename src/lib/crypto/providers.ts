/* Live data providers for crypto balances (BTC/EVM/TRON/TON) and prices (CMC).
 * Each balance fetcher returns holdings in token units. On a hard failure
 * (network down, non-2xx, RPC unreachable) the fetcher THROWS, so the sync layer
 * can keep the last known balance instead of overwriting it with zero (PRD §7).
 * An empty array means "fetched OK, the address is genuinely empty".
 * Network access to these hosts is required (works on an open network; blocked
 * in restricted sandboxes). */
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
  const base = process.env.BTC_API_URL || "https://blockstream.info/api";
  const res = await fetch(`${base}/address/${address}`, { signal: signal() });
  if (!res.ok) throw new Error("btc " + res.status);
  const j: any = await res.json();
  const cs = j?.chain_stats ?? {};
  const ms = j?.mempool_stats ?? {};
  const sats =
    (cs.funded_txo_sum ?? 0) - (cs.spent_txo_sum ?? 0) + (ms.funded_txo_sum ?? 0) - (ms.spent_txo_sum ?? 0);
  return sats > 0 ? [{ symbol: "BTC", amount: sats / 1e8 }] : [];
}

/* ---------- EVM (JSON-RPC): native coin + USDT/USDC via balanceOf ----------
 * Generic over the network: a fetcher is built from an RPC list, the native
 * coin symbol and the stablecoin contracts on that chain. Ethereum and BNB
 * Smart Chain (BSC) share this exact code path — only RPCs/contracts/decimals
 * differ (BEP20 stablecoins use 18 decimals, Ethereum's use 6). */
interface EvmToken {
  symbol: string;
  contract: string;
  decimals: number;
}

// Build a JSON-RPC caller over a list of endpoints; the first that answers wins.
// Throws if every endpoint is unreachable/errors, so a transient outage is not
// mistaken for an empty balance (PRD §7).
function makeRpc(rpcs: string[]) {
  return async function rpc(method: string, params: unknown[]): Promise<string> {
    let lastErr: unknown = null;
    for (const url of rpcs) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: signal(),
        });
        if (!res.ok) {
          lastErr = new Error("evm " + res.status);
          continue;
        }
        const j: any = await res.json();
        if (j?.error) {
          lastErr = new Error("evm rpc error");
          continue;
        }
        if (j?.result != null) return j.result;
        lastErr = new Error("evm empty result");
      } catch (e) {
        lastErr = e; // try next endpoint
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("evm rpc failed");
  };
}

// One EVM balance fetcher: native coin + each configured stablecoin via balanceOf.
function makeEvmFetcher(rpcs: string[], nativeSymbol: string, tokens: EvmToken[]) {
  const rpc = makeRpc(rpcs);
  return async function (address: string): Promise<Holding[]> {
    const out: Holding[] = [];
    const wei = await rpc("eth_getBalance", [address, "latest"]);
    const native = Number(BigInt(wei)) / 1e18;
    if (native > 0) out.push({ symbol: nativeSymbol, amount: native });
    for (const t of tokens) {
      const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
      const hex = await rpc("eth_call", [{ to: t.contract, data }, "latest"]);
      if (hex && hex !== "0x") {
        const amt = Number(BigInt(hex)) / 10 ** t.decimals;
        if (amt > 0) out.push({ symbol: t.symbol, amount: amt });
      }
    }
    return out;
  };
}

// Ethereum mainnet. Several public RPCs; override/prepend via EVM_RPC_URL.
const ETH_RPCS = [
  process.env.EVM_RPC_URL,
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com",
  "https://cloudflare-eth.com",
  "https://1rpc.io/eth",
].filter(Boolean) as string[];
const ETH_TOKENS: EvmToken[] = [
  { symbol: "USDT", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "USDC", contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
];
export const fetchEvm = makeEvmFetcher(ETH_RPCS, "ETH", ETH_TOKENS);

// BNB Smart Chain (BSC). Public RPCs, no key needed; override/prepend via BSC_RPC_URL.
// BEP20 USDT/USDC use 18 decimals (unlike Ethereum's 6).
const BSC_RPCS = [
  process.env.BSC_RPC_URL,
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.binance.org",
  "https://1rpc.io/bnb",
].filter(Boolean) as string[];
const BSC_TOKENS: EvmToken[] = [
  { symbol: "USDT", contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  { symbol: "USDC", contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
];
export const fetchBsc = makeEvmFetcher(BSC_RPCS, "BNB", BSC_TOKENS);

/* ---------- TRON (TronGrid): native TRX + USDT-TRC20 ---------- */
const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Minimal base58 decode (no checksum verification) — enough to turn a TRON
// base58check address into raw bytes for ABI encoding.
function base58Decode(str: string): number[] {
  const bytes: number[] = [];
  for (const ch of str) {
    let carry = B58_ALPHABET.indexOf(ch);
    if (carry < 0) throw new Error("invalid base58 char");
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (let i = 0; i < str.length && str[i] === "1"; i++) bytes.push(0);
  return bytes.reverse();
}

// TRON base58check address -> 20-byte hex payload (drops the 0x41 version byte
// and the 4-byte checksum), left-padded to 32 bytes for an ABI address arg.
function tronAddrParam(address: string): string {
  const decoded = base58Decode(address);
  if (decoded.length !== 25) throw new Error("bad tron address");
  const payload = decoded.slice(1, 21);
  const hex = payload.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.padStart(64, "0");
}

// Read a TRC20 balance straight from the contract via constant call. This is the
// ground truth, unlike the cached `trc20` list on /v1/accounts which is often stale/empty.
async function fetchTrc20Balance(
  base: string,
  headers: Record<string, string>,
  contract: string,
  address: string,
): Promise<number> {
  const res = await fetch(`${base}/wallet/triggerconstantcontract`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_address: address,
      contract_address: contract,
      function_selector: "balanceOf(address)",
      parameter: tronAddrParam(address),
      visible: true,
    }),
    signal: signal(),
  });
  if (!res.ok) throw new Error("tron trc20 " + res.status);
  const j: any = await res.json();
  const hex = j?.constant_result?.[0];
  if (!hex) return 0;
  return Number(BigInt("0x" + hex)) / 1e6;
}

export async function fetchTron(address: string): Promise<Holding[]> {
  const base = process.env.TRONGRID_API_URL || "https://api.trongrid.io";
  const headers: Record<string, string> = {};
  if (process.env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;

  const out: Holding[] = [];
  // Liquid TRX only — frozen/staked TRX is excluded by product decision (not spendable).
  const res = await fetch(`${base}/v1/accounts/${address}`, { headers, signal: signal() });
  if (!res.ok) throw new Error("tron account " + res.status);
  const j: any = await res.json();
  const acc = j?.data?.[0];
  const sun = Number(acc?.balance || 0);
  if (sun > 0) out.push({ symbol: "TRX", amount: sun / 1e6 });

  // USDT-TRC20 read directly from the contract.
  const usdt = await fetchTrc20Balance(base, headers, TRON_USDT, address);
  if (usdt > 0) out.push({ symbol: "USDT", amount: usdt });

  return out;
}

/* ---------- TON (toncenter): native TON ---------- */
export async function fetchTon(address: string): Promise<Holding[]> {
  const base = process.env.TON_API_URL || "https://toncenter.com/api/v2";
  const key = process.env.TON_API_KEY ? `&api_key=${process.env.TON_API_KEY}` : "";
  const res = await fetch(`${base}/getAddressInformation?address=${encodeURIComponent(address)}${key}`, { signal: signal() });
  if (!res.ok) throw new Error("ton " + res.status);
  const j: any = await res.json();
  const nano = Number(j?.result?.balance ?? 0);
  return nano > 0 ? [{ symbol: "TON", amount: nano / 1e9 }] : [];
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
  BSC: (a: string) => Promise<Holding[]>;
  TRX: (a: string) => Promise<Holding[]>;
  TON: (a: string) => Promise<Holding[]>;
  prices: (s: string[]) => Promise<Map<string, Price>>;
}

export const defaultProviders: CryptoProviders = {
  BTC: fetchBtc,
  ETH: fetchEvm,
  BSC: fetchBsc,
  TRX: fetchTron,
  TON: fetchTon,
  prices: getPrices,
};
