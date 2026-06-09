/* Read-only access to the external CoinLink Postgres (the `coinlink_payable`
 * view). This is a SEPARATE database from the app's own Postgres — connection
 * details come from COINLINK_* env vars and are never committed. Used only by
 * the CoinLink payable sync. */
import "server-only";
import { Pool, type PoolConfig } from "pg";

/** Identifiers (view/column names) can't be passed as query parameters, so
 *  they're interpolated. Allow only plain SQL identifiers to keep that safe. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name: string, fallback: string): string {
  const v = (name || "").trim();
  if (!v) return fallback;
  if (!IDENT.test(v)) throw new Error(`invalid SQL identifier: ${name}`);
  return v;
}

export const PAYABLE_VIEW = () => ident(process.env.COINLINK_PAYABLE_VIEW || "", "coinlink_payable");
export const DATE_COLUMN = () => ident(process.env.COINLINK_DATE_COLUMN || "", "report_date");

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

/** Pull the current outstanding CoinLink payable for [Feb 1 of this year, today].
 *  Mirrors the BI «ЦУ Payments» → «Кредиторская задолженность» figure, restricted
 *  to the period window. Both bounds cast to ::date so the column may be date or
 *  timestamp. */
export async function fetchPayable(): Promise<PayableResult> {
  const view = PAYABLE_VIEW();
  const dateCol = DATE_COLUMN();
  const from = periodFrom();
  const to = new Date();
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = to.toISOString().slice(0, 10);

  const sql = `
    SELECT partner, COALESCE(SUM(payout_usdt), 0)::numeric AS debt
    FROM ${view}
    WHERE is_outstanding
      AND ${dateCol}::date >= $1::date
      AND ${dateCol}::date <= $2::date
    GROUP BY partner
    ORDER BY debt DESC`;

  const { rows } = await getPool().query(sql, [fromISO, toISO]);
  const partners: PayableRow[] = rows.map((r: { partner: string | null; debt: string }) => ({
    partner: r.partner ?? "—",
    debt: Number(r.debt) || 0,
  }));
  const total = partners.reduce((s, p) => s + p.debt, 0);
  return { total, partners, from, to };
}
