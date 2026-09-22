/* Одноразовый бэкфилл посуточной истории холдингов личных кошельков
 * (WalletDailySnapshot) за прошлые дни — чтобы график «по монетам» показывал
 * реальную историю, а не копил с нуля.
 *
 * Метод по каждому адресу:
 *   - BTC / TRON / TON — восстанавливаем дневной баланс из ИСТОРИИ ОПЕРАЦИЙ
 *     (эксплореры отдают список переводов): идём от текущего баланса назад,
 *     вычитая переводы «из будущего» → баланс на конец каждого дня.
 *   - EVM (ETH/BSC) — публичные RPC не хранят старое состояние надёжно, поэтому
 *     best-effort: спрашиваем баланс/balanceOf на блоке нужного дня у списка RPC
 *     (архивные отвечают, остальные — пропускаем этот день).
 * Цены на каждую дату — CoinGecko (бесплатно, дневная гранулярность).
 *
 * Устойчивость (PRD §7): любой сбой по (кошелёк, монета, день) просто пропускается,
 * а не роняет весь прогон и не пишет мусор. Существующие снимки НЕ перезаписываются —
 * дописываются только отсутствующие прошлые дни (идемпотентно, безопасно повторять).
 */
import "server-only";
import { prisma } from "../prisma";

const DAY = 86400000;
const TIMEOUT = 15000;
const sig = () => AbortSignal.timeout(TIMEOUT);

/** UTC-полночь дня, содержащего ts (мс). */
function utcMidnight(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function dayIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Обёрнутый биткоин сводим к BTC — как в живом синке (crypto.ts). */
const SYMBOL_MERGE: Record<string, string> = { WBTC: "BTC", BTCB: "BTC" };
const mergeSymbol = (s: string) => SYMBOL_MERGE[s] || s;

/* ===================== Цены (CoinGecko) ===================== */

const CG_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  BNB: "binancecoin",
  TRX: "tron",
  USDT: "tether",
  USDC: "usd-coin",
  TON: "the-open-network",
};
function cgIdFor(symbol: string): string | null {
  const envMap = process.env.COINGECKO_IDS || ""; // "TON:the-open-network,FOO:bar"
  for (const pair of envMap.split(",")) {
    const [s, id] = pair.split(":").map((x) => x.trim());
    if (s && id && s.toUpperCase() === symbol.toUpperCase()) return id;
  }
  return CG_ID[symbol.toUpperCase()] || null;
}

/** Дневные цены символа в USD: dayMs(UTC-полночь) → price. Один запрос на монету. */
async function fetchDailyPrices(symbol: string, fromMs: number, toMs: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  // Стейблкоины — фиксируем ≈$1, если история недоступна (fallback ниже всё равно даст CG).
  const id = cgIdFor(symbol);
  if (!id) return out;
  const base = process.env.COINGECKO_URL || "https://api.coingecko.com/api/v3";
  const key = process.env.COINGECKO_API_KEY ? `&x_cg_demo_api_key=${process.env.COINGECKO_API_KEY}` : "";
  const url = `${base}/coins/${id}/market_chart/range?vs_currency=usd&from=${Math.floor(fromMs / 1000)}&to=${Math.floor(toMs / 1000)}${key}`;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: sig() });
  if (!res.ok) throw new Error(`coingecko ${symbol} ${res.status}`);
  const j: any = await res.json();
  const rows: [number, number][] = Array.isArray(j?.prices) ? j.prices : [];
  for (const [ms, price] of rows) {
    if (typeof ms === "number" && typeof price === "number") out.set(utcMidnight(ms), price);
  }
  return out;
}

/** Цена на день с переносом ближайшей известной назад (если точной нет). */
function priceOn(prices: Map<number, number>, dayMs: number): number | null {
  if (prices.has(dayMs)) return prices.get(dayMs)!;
  // ищем ближайший предыдущий день с ценой (до 7 дней назад)
  for (let k = 1; k <= 7; k++) {
    const p = prices.get(dayMs - k * DAY);
    if (p != null) return p;
  }
  // затем ближайший следующий
  for (let k = 1; k <= 7; k++) {
    const p = prices.get(dayMs + k * DAY);
    if (p != null) return p;
  }
  return null;
}

/* ===================== Восстановление балансов ===================== */

interface Delta { ts: number; delta: number } // ts — мс, delta — в единицах монеты (+приток/−отток)

/** Обратная реконструкция: из текущего баланса вычитаем переводы «из будущего»,
 *  получая баланс на конец каждого дня в [startDay, endDay]. */
function dailyFromDeltas(current: number, deltas: Delta[], startDayMs: number, endDayMs: number): Map<number, number> {
  const out = new Map<number, number>();
  const sorted = deltas.slice().sort((a, b) => b.ts - a.ts); // по убыванию времени
  let bal = current;
  let i = 0;
  for (let day = endDayMs; day >= startDayMs; day -= DAY) {
    const boundary = day + DAY; // конец дня = следующая полночь
    while (i < sorted.length && sorted[i].ts >= boundary) {
      bal -= sorted[i].delta;
      i++;
    }
    out.set(day, bal > 1e-12 ? bal : 0);
  }
  return out;
}

/* ---------- BTC (Blockstream): точная реконструкция по vin/vout ---------- */
async function btcDeltas(address: string, sinceMs: number): Promise<Delta[]> {
  const base = process.env.BTC_API_URL || "https://blockstream.info/api";
  const deltas: Delta[] = [];
  let lastSeen = "";
  for (let page = 0; page < 40; page++) {
    const url = lastSeen ? `${base}/address/${address}/txs/chain/${lastSeen}` : `${base}/address/${address}/txs`;
    const res = await fetch(url, { signal: sig() });
    if (!res.ok) throw new Error("btc txs " + res.status);
    const txs: any[] = await res.json();
    if (!txs.length) break;
    for (const tx of txs) {
      const ts = (tx?.status?.block_time ?? 0) * 1000;
      let d = 0;
      for (const o of tx.vout || []) if (o?.scriptpubkey_address === address) d += Number(o.value) || 0;
      for (const vin of tx.vin || []) if (vin?.prevout?.scriptpubkey_address === address) d -= Number(vin.prevout.value) || 0;
      if (d !== 0 && ts > 0) deltas.push({ ts, delta: d / 1e8 });
    }
    lastSeen = txs[txs.length - 1]?.txid || "";
    const oldest = (txs[txs.length - 1]?.status?.block_time ?? 0) * 1000;
    if (!lastSeen || (oldest && oldest < sinceMs)) break;
  }
  return deltas;
}

/* ---------- TRON (TronGrid): TRX (native) + USDT-TRC20 ---------- */
const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
function tronHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (process.env.TRONGRID_API_KEY) h["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  return h;
}
async function tronTrc20Deltas(address: string, sinceMs: number): Promise<Delta[]> {
  const base = process.env.TRONGRID_API_URL || "https://api.trongrid.io";
  const deltas: Delta[] = [];
  let url: string | null = `${base}/v1/accounts/${address}/transactions/trc20?limit=200&only_confirmed=true&contract_address=${TRON_USDT}&order_by=block_timestamp,desc`;
  for (let page = 0; page < 30 && url; page++) {
    const res: Response = await fetch(url, { headers: tronHeaders(), signal: sig() });
    if (!res.ok) throw new Error("tron trc20 " + res.status);
    const j: any = await res.json();
    const rows: any[] = j?.data || [];
    for (const r of rows) {
      const ts = Number(r?.block_timestamp) || 0;
      const val = Number(r?.value) || 0;
      if (!ts || !val) continue;
      const dir = r?.to === address ? 1 : r?.from === address ? -1 : 0;
      if (dir) deltas.push({ ts, delta: (dir * val) / 1e6 });
    }
    const oldest = rows.length ? Number(rows[rows.length - 1]?.block_timestamp) || 0 : 0;
    url = oldest && oldest >= sinceMs ? j?.meta?.links?.next || null : null;
  }
  return deltas;
}
async function tronTrxDeltas(address: string, sinceMs: number): Promise<Delta[]> {
  const base = process.env.TRONGRID_API_URL || "https://api.trongrid.io";
  const deltas: Delta[] = [];
  let url: string | null = `${base}/v1/accounts/${address}/transactions?limit=200&only_confirmed=true&order_by=block_timestamp,desc`;
  for (let page = 0; page < 30 && url; page++) {
    const res: Response = await fetch(url, { headers: tronHeaders(), signal: sig() });
    if (!res.ok) throw new Error("tron tx " + res.status);
    const j: any = await res.json();
    const rows: any[] = j?.data || [];
    for (const r of rows) {
      const ts = Number(r?.block_timestamp) || 0;
      const c = r?.raw_data?.contract?.[0];
      if (!ts || c?.type !== "TransferContract") continue;
      const v = c?.parameter?.value || {};
      const amt = Number(v?.amount) || 0;
      if (!amt) continue;
      const dir = v?.to_address && addrEq(v.to_address, address) ? 1 : v?.owner_address && addrEq(v.owner_address, address) ? -1 : 0;
      if (dir) deltas.push({ ts, delta: (dir * amt) / 1e6 }); // комиссии игнорируем (best-effort)
    }
    const oldest = rows.length ? Number(rows[rows.length - 1]?.block_timestamp) || 0 : 0;
    url = oldest && oldest >= sinceMs ? j?.meta?.links?.next || null : null;
  }
  return deltas;
}
// TronGrid отдаёт адреса иногда в hex (41…), иногда в base58 (visible). Сравниваем мягко.
function addrEq(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.toLowerCase().endsWith(b.toLowerCase().slice(-20)) || b.toLowerCase().endsWith(a.toLowerCase().slice(-20));
}

/* ---------- TON (toncenter): native TON ---------- */
async function tonDeltas(address: string, sinceMs: number): Promise<Delta[]> {
  const base = process.env.TON_API_URL || "https://toncenter.com/api/v2";
  const key = process.env.TON_API_KEY ? `&api_key=${process.env.TON_API_KEY}` : "";
  const deltas: Delta[] = [];
  let beforeLt = "";
  for (let page = 0; page < 30; page++) {
    const cur = `${base}/getTransactions?address=${encodeURIComponent(address)}&limit=50&archival=true${beforeLt}${key}`;
    const res = await fetch(cur, { signal: sig() });
    if (!res.ok) throw new Error("ton tx " + res.status);
    const j: any = await res.json();
    const rows: any[] = j?.result || [];
    if (!rows.length) break;
    for (const r of rows) {
      const ts = (Number(r?.utime) || 0) * 1000;
      if (!ts) continue;
      const inV = Number(r?.in_msg?.value) || 0;
      let outV = 0;
      for (const m of r?.out_msgs || []) outV += Number(m?.value) || 0;
      const fee = Number(r?.fee) || 0;
      const d = (inV - outV - fee) / 1e9;
      if (Math.abs(d) > 1e-12) deltas.push({ ts, delta: d });
    }
    const last = rows[rows.length - 1];
    const lt = last?.transaction_id?.lt;
    const hash = last?.transaction_id?.hash;
    const oldest = (Number(last?.utime) || 0) * 1000;
    if (!lt || !hash || (oldest && oldest < sinceMs)) break;
    beforeLt = `&lt=${lt}&hash=${encodeURIComponent(hash)}&to_lt=0`;
  }
  return deltas;
}

/* ---------- EVM (ETH/BSC): историческое состояние через RPC ---------- */
const ETH_RPCS = [process.env.EVM_RPC_URL, "https://rpc.ankr.com/eth", "https://eth.llamarpc.com", "https://ethereum-rpc.publicnode.com", "https://1rpc.io/eth"].filter(Boolean) as string[];
const BSC_RPCS = [process.env.BSC_RPC_URL, "https://rpc.ankr.com/bsc", "https://binance.llamarpc.com", "https://bsc-rpc.publicnode.com", "https://1rpc.io/bnb"].filter(Boolean) as string[];
const ETH_TOKENS = [
  { symbol: "USDT", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "USDC", contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { symbol: "WBTC", contract: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
];
const BSC_TOKENS = [
  { symbol: "USDT", contract: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  { symbol: "USDC", contract: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  { symbol: "BTCB", contract: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
];

async function rpcCall(rpcs: string[], method: string, params: unknown[]): Promise<string | null> {
  for (const url of rpcs) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: sig() });
      if (!res.ok) continue;
      const j: any = await res.json();
      if (j?.error || j?.result == null) continue;
      return j.result;
    } catch {
      /* следующий RPC */
    }
  }
  return null;
}

/** EVM: посуточные балансы native + токенов через состояние на блоке дня.
 *  Только для монет, что сейчас на балансе (fully-sold историю не тянем). */
async function evmDaily(chain: "ETH" | "BSC", address: string, startDayMs: number, endDayMs: number, avgSecDefault: number): Promise<Map<string, Map<number, number>>> {
  const rpcs = chain === "ETH" ? ETH_RPCS : BSC_RPCS;
  const tokens = chain === "ETH" ? ETH_TOKENS : BSC_TOKENS;
  const nativeSym = chain === "ETH" ? "ETH" : "BNB";
  const out = new Map<string, Map<number, number>>();

  const latestHex = await rpcCall(rpcs, "eth_blockNumber", []);
  if (!latestHex) return out; // RPC недоступен — пропускаем EVM целиком
  const latest = Number(BigInt(latestHex));
  const blk = await rpcCall(rpcs, "eth_getBlockByNumber", [latestHex, false]);
  const latestTs = blk ? Number(BigInt((blk as any).timestamp)) * 1000 : Date.now();
  const avgSec = Number(process.env[`BACKFILL_${chain}_BLOCK_SEC`]) || avgSecDefault;
  const blockOfDay = (dayMs: number) => Math.max(1, latest - Math.round((latestTs - dayMs) / 1000 / avgSec));

  // какие монеты держим сейчас (native + токены с ненулевым балансом на latest)
  const held: { symbol: string; kind: "native" | "token"; contract?: string; decimals?: number }[] = [];
  const nativeNow = await rpcCall(rpcs, "eth_getBalance", [address, "latest"]);
  if (nativeNow && Number(BigInt(nativeNow)) > 0) held.push({ symbol: nativeSym, kind: "native" });
  for (const t of tokens) {
    const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
    const now = await rpcCall(rpcs, "eth_call", [{ to: t.contract, data }, "latest"]);
    if (now && now !== "0x" && Number(BigInt(now)) > 0) held.push({ symbol: t.symbol, kind: "token", contract: t.contract, decimals: t.decimals });
  }
  if (!held.length) return out;

  for (let day = startDayMs; day <= endDayMs; day += DAY) {
    const bh = "0x" + blockOfDay(day).toString(16);
    for (const h of held) {
      const sym = mergeSymbol(h.symbol);
      let amount: number | null = null;
      if (h.kind === "native") {
        const r = await rpcCall(rpcs, "eth_getBalance", [address, bh]);
        if (r != null) amount = Number(BigInt(r)) / 1e18;
      } else {
        const data = "0x70a08231" + address.slice(2).toLowerCase().padStart(64, "0");
        const r = await rpcCall(rpcs, "eth_call", [{ to: h.contract, data }, bh]);
        if (r != null && r !== "0x") amount = Number(BigInt(r)) / 10 ** (h.decimals || 18);
      }
      if (amount == null) continue; // архивное состояние недоступно на этот день — пропускаем
      (out.get(sym) || out.set(sym, new Map()).get(sym)!).set(day, amount);
    }
  }
  return out;
}

/* ---------- TON-номера: историческая цена номера ---------- */
// Опционально: URL истории цены номера (nums888). Плейсхолдеры {from}/{to} — unix-сек.
// Гибкий парсинг ответа. Если не задан/недоступен — используем фолбэк по курсу TON.
async function fetchNums888History(fromMs: number, toMs: number): Promise<Map<number, number> | null> {
  const tmpl = process.env.NUMS888_HISTORY_URL;
  if (!tmpl) return null;
  const url = tmpl.replace("{from}", String(Math.floor(fromMs / 1000))).replace("{to}", String(Math.floor(toMs / 1000)));
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: sig() });
    if (!res.ok) return null;
    const j: any = await res.json();
    const rows: any[] = Array.isArray(j) ? j : Array.isArray(j?.prices) ? j.prices : Array.isArray(j?.data) ? j.data : [];
    const out = new Map<number, number>();
    for (const r of rows) {
      let ts: number, price: number;
      if (Array.isArray(r)) { ts = Number(r[0]); price = Number(r[1]); }
      else { ts = Number(r.t ?? r.time ?? r.timestamp ?? r.date); price = Number(r.usd ?? r.price ?? r.value ?? r.close); }
      if (!isFinite(ts) || !isFinite(price) || price <= 0) continue;
      if (ts < 1e12) ts *= 1000; // sec → ms
      out.set(utcMidnight(ts), price);
    }
    return out.size ? out : null;
  } catch {
    return null;
  }
}

/* ===================== Оркестрация ===================== */

export interface BackfillResult {
  days: number;
  wallets: { label: string; chain: string; address: string; coins: Record<string, number>; error?: string }[];
  written: number;
  pricesMissing: string[];
  tonNumbers?: { qty: number; unitUsd: number; source: string; written: number };
}

export async function backfillCoinHistory(days = 200): Promise<BackfillResult> {
  const now = Date.now();
  const endDay = utcMidnight(now) - DAY; // вчера (сегодня пишет живой синк)
  const startDay = utcMidnight(now - days * DAY);
  const result: BackfillResult = { days, wallets: [], written: 0, pricesMissing: [] };

  const wallets = await prisma.wallet.findMany({ where: { scope: "personal" } });
  const priceCache = new Map<string, Map<number, number>>();
  const priceFail = new Set<string>();
  const ensurePrices = async (symbol: string) => {
    const key = symbol.toUpperCase();
    if (priceCache.has(key) || priceFail.has(key)) return;
    try {
      priceCache.set(key, await fetchDailyPrices(key, startDay - 3 * DAY, now));
    } catch {
      priceFail.add(key);
      result.pricesMissing.push(key);
    }
  };

  for (const w of wallets) {
    const wr = { label: w.label, chain: w.chain as string, address: w.address, coins: {} as Record<string, number> };
    result.wallets.push(wr);
    try {
      // 1) собрать посуточные балансы по монетам этого кошелька
      const perCoin = new Map<string, Map<number, number>>();
      const addFromDeltas = async (symbol: string, deltasFn: () => Promise<Delta[]>) => {
        const sym = mergeSymbol(symbol);
        const deltas = await deltasFn();
        // текущий баланс монеты — из сохранённых holdingsJson (или 0)
        const hs = Array.isArray(w.holdingsJson) ? (w.holdingsJson as any[]) : [];
        const cur = hs.filter((h) => mergeSymbol(String(h?.symbol || "")) === sym).reduce((s, h) => s + (Number(h?.amount) || 0), 0);
        if (cur <= 0 && !deltas.length) return;
        perCoin.set(sym, dailyFromDeltas(cur, deltas, startDay, endDay));
      };

      if (w.chain === "BTC") {
        await addFromDeltas("BTC", () => btcDeltas(w.address, startDay));
      } else if (w.chain === "TRX") {
        await addFromDeltas("USDT", () => tronTrc20Deltas(w.address, startDay));
        await addFromDeltas("TRX", () => tronTrxDeltas(w.address, startDay));
      } else if (w.chain === "TON") {
        await addFromDeltas("TON", () => tonDeltas(w.address, startDay));
      } else if (w.chain === "ETH" || w.chain === "BSC") {
        const evm = await evmDaily(w.chain, w.address, startDay, endDay, w.chain === "ETH" ? 12 : 3);
        for (const [sym, m] of evm) perCoin.set(sym, m);
      }

      // 2) какие дни уже есть (живой синк) — не перезаписываем
      const existing = await prisma.walletDailySnapshot.findMany({ where: { walletId: w.id, day: { gte: new Date(startDay), lte: new Date(endDay) } }, select: { symbol: true, day: true } });
      const have = new Set(existing.map((e) => `${e.symbol}|${utcMidnight(e.day.getTime())}`));

      // 3) переоценка и запись отсутствующих дней
      for (const [sym, dayMap] of perCoin) {
        await ensurePrices(sym);
        const prices = priceCache.get(sym.toUpperCase());
        let wrote = 0;
        for (const [dayMs, amount] of dayMap) {
          if (have.has(`${sym}|${dayMs}`)) continue;
          const price = prices ? priceOn(prices, dayMs) : sym === "USDT" || sym === "USDC" ? 1 : null;
          if (price == null) continue;
          await prisma.walletDailySnapshot.create({
            data: { walletId: w.id, symbol: sym, day: new Date(dayMs), amount, usd: Math.round(amount * price), label: w.label, address: w.address, chain: w.chain as string },
          });
          wrote++;
        }
        if (wrote) {
          wr.coins[sym] = wrote;
          result.written += wrote;
        }
      }
    } catch (e) {
      (wr as any).error = String(e).slice(0, 200);
    }
  }

  // TON-номера: их количество известно с момента отслеживания — восстанавливаем
  // историю стоимости = количество × историческая цена номера. Цена: nums888
  // (если задан NUMS888_HISTORY_URL), иначе фолбэк — масштабируем текущую цену номера
  // по историческому курсу TON (GRAM) с CoinGecko (приближение: floor в GRAM ~стабилен).
  try {
    const tonAssets = await prisma.asset.findMany({ where: { symbol: "TONNUM" } });
    const qty = tonAssets.reduce((s, a) => s + (a.amount == null ? 0 : Number(a.amount)), 0);
    const priceRow = await prisma.priceCache.findUnique({ where: { symbol: "TONNUM" } });
    const curUnit = priceRow ? Number(priceRow.usd) : 0;
    if (qty > 0 && curUnit > 0) {
      let unitByDay = await fetchNums888History(startDay - 3 * DAY, now);
      let source = "nums888";
      if (!unitByDay) {
        await ensurePrices("TON");
        const ton = priceCache.get("TON");
        const refToday = ton ? priceOn(ton, endDay) : null;
        if (ton && refToday) {
          unitByDay = new Map();
          for (let day = startDay; day <= endDay; day += DAY) {
            const tp = priceOn(ton, day);
            if (tp) unitByDay.set(day, (curUnit * tp) / refToday);
          }
          source = "ton-ratio (approx)";
        }
      }
      let written = 0;
      if (unitByDay) {
        const existing = await prisma.walletDailySnapshot.findMany({ where: { walletId: "tonnum", day: { gte: new Date(startDay), lte: new Date(endDay) } }, select: { day: true } });
        const have = new Set(existing.map((e) => utcMidnight(e.day.getTime())));
        for (let day = startDay; day <= endDay; day += DAY) {
          if (have.has(day)) continue;
          const unit = priceOn(unitByDay, day);
          if (unit == null) continue;
          await prisma.walletDailySnapshot.create({
            data: { walletId: "tonnum", symbol: "TONNUM", day: new Date(day), amount: qty, usd: Math.round(qty * unit), label: "TON номера", address: "—", chain: "TON" },
          });
          written++;
        }
      }
      result.written += written;
      result.tonNumbers = { qty, unitUsd: curUnit, source, written };
    }
  } catch (e) {
    result.tonNumbers = { qty: 0, unitUsd: 0, source: "error: " + String(e).slice(0, 120), written: 0 };
  }

  return result;
}
