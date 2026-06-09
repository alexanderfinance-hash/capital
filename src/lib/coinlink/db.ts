/* Read-only access to the external CoinLink Postgres (the `coinlink_payable`
 * view + helper functions). This is a SEPARATE database from the app's own
 * Postgres — connection details come from COINLINK_* env vars and are never
 * committed. Used only by the CoinLink payable sync.
 *
 * The figure is taken from the database's OWN functions so it matches the BI
 * dashboard «ЦУ Payments» → «Кредиторская задолженность» exactly (computing it
 * by hand from the raw view did not reproduce the BI total):
 *   coinlink_payable_total(from, to)       -> one number
 *   coinlink_payable_by_partner(from, to)  -> rows (partner, debt)
 * The second date is EXCLUSIVE (BI convention: from <= report_date < to). */
import "server-only";
import { Pool, type PoolConfig } from "pg";

/** Function names are interpolated (can't be query params), so allow only
 *  plain SQL identifiers to keep that safe. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name: string, fallback: string): string {
  const v = (name || "").trim();
  if (!v) return fallback;
  if (!IDENT.test(v)) throw new Error(`invalid SQL identifier: ${name}`);
  return v;
}

export const TOTAL_FN = () => ident(process.env.COINLINK_TOTAL_FN || "", "coinlink_payable_total");
export const BY_PARTNER_FN = () => ident(process.env.COINLINK_BY_PARTNER_FN || "", "coinlink_payable_by_partner");

/** Lower bound of the synced window: Feb 1 of the current year (per spec —
 *  "с 1 февраля текущего года"). Overridable with COINLINK_PERIOD_FROM (ISO). */
export function periodFrom(now = new Date()): Date {
  const override = process.env.COINLINK_PERIOD_FROM;
  if (override) {
    const d = new Date(override);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), 1, 1)); // month 1 = February
}

let pool: Pool | null = null;
function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.COINLINK_DATABASE_URL;
  let cfg: PoolConfig;
  if (url) {
    cfg = { connectionString: url };
  } else {
    cfg = {
      host: process.env.COINLINK_DB_HOST,
      port: process.env.COINLINK_DB_PORT ? Number(process.env.COINLINK_DB_PORT) : undefined,
      database: process.env.COINLINK_DB_NAME,
      user: process.env.COINLINK_DB_USER,
      password: process.env.COINLINK_DB_PASSWORD,
    };
  }
  pool = new Pool({
    ...cfg,
    max: 2,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    // SSL off by default; opt in with COINLINK_DB_SSL=true.
    ssl: process.env.COINLINK_DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

export interface PayableRow {
  partner: string;
  debt: number;
}
export interface PayableResult {
  total: number;
  partners: PayableRow[];
  from: Date;
  to: Date;
}

const isNumericStr = (v: unknown): boolean => v != null && /^-?\d+(\.\d+)?$/.test(String(v).trim());

/** Map a by-partner row to {partner, debt} without assuming exact column names:
 *  the first non-numeric column is the partner, a numeric column (preferring a
 *  debt-like name) is the amount. */
function mapPartnerRow(r: Record<string, unknown>): PayableRow {
  const keys = Object.keys(r);
  const partnerKey = keys.find((k) => !isNumericStr(r[k])) ?? keys[0];
  const debtKey =
    keys.find((k) => k !== partnerKey && /payout|payable|debt|usdt|total|amount|cred|кредит|сумм|долг/i.test(k) && isNumericStr(r[k])) ??
    keys.find((k) => k !== partnerKey && isNumericStr(r[k])) ??
    keys[keys.length - 1];
  return { partner: String(r[partnerKey] ?? "—"), debt: Number(r[debtKey]) || 0 };
}

/** Pull the CoinLink payable for [Feb 1 of this year, today) via the DB's own
 *  functions, so it matches BI «ЦУ Payments» → «Кредиторская задолженность». */
export async function fetchPayable(): Promise<PayableResult> {
  const totalFn = TOTAL_FN();
  const byPartnerFn = BY_PARTNER_FN();
  const from = periodFrom();
  const to = new Date(); // exclusive upper bound (BI: from <= report_date < to)
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = to.toISOString().slice(0, 10);

  const pool = getPool();
  const totalRes = await pool.query(`SELECT ${totalFn}($1::date, $2::date) AS total`, [fromISO, toISO]);
  const total = Number(totalRes.rows[0]?.total) || 0;

  const partnerRes = await pool.query(`SELECT * FROM ${byPartnerFn}($1::date, $2::date)`, [fromISO, toISO]);
  const partners = partnerRes.rows
    .map((r) => mapPartnerRow(r as Record<string, unknown>))
    .filter((p) => p.debt !== 0)
    .sort((a, b) => b.debt - a.debt);

  return { total, partners, from, to };
}
