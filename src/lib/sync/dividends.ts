/* Sync personal income (mostly dividends) from the ДДС Google Sheet ledger
 * into MonthlyIncome (USD per "YYYY-MM"). The ledger is a flat transaction
 * journal with columns: Месяц | Неделя | Год | Дата | Сумма | … | Статья |
 * Платеж/поступл | Вид д-ти | … — one row per payment. We sum the absolute
 * amounts of rows whose Статья is the configured income category ("Дивиденды").
 *
 * The ДДС is kept in USD (the business settles in USDT), so no FX conversion is
 * applied by default; set DDS_CURRENCY=RUB to convert per the payment date. */
import "server-only";
import { prisma } from "../prisma";
import { listSheetTitles, readValuesFrom } from "../sheets";
import { getUsdRubRates } from "../fx";

// The ДДС spreadsheet (shared read-only with the service account). Override per
// environment; defaults to the file the owner provided.
const DEFAULT_DDS_ID = "1fwMFtSgOUdSfmgVS3SwrYpFvwsxiPBXpL0SBVLdlaLs";

export function ddsSpreadsheetId(): string {
  return process.env.GOOGLE_SHEETS_DDS_ID || DEFAULT_DDS_ID;
}

function incomeCategories(): Set<string> {
  const raw = process.env.DDS_INCOME_CATEGORIES ?? "Дивиденды";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

function parseNum(s: string | undefined): number {
  if (s == null) return 0;
  const t = String(s).replace(/[^\d.,\-]/g, "").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

/** "24.12.2025" → "2025-12" (period). Returns null if unparseable. */
function periodOf(date: string): { period: string; iso: string } | null {
  const m = (date || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  const year = m[3];
  return { period: `${year}-${month}`, iso: `${year}-${month}-${day}` };
}

const norm = (s: string) => (s || "").trim().toLowerCase();

/** Locate the header row and the indices of the columns we need. The ledger may
 *  be preceded by blank/summary rows, so we scan for the row that carries the
 *  Дата / Сумма / Статья labels. */
function findLedger(rows: string[][]): { headerRow: number; date: number; sum: number; statya: number } | null {
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const cells = (rows[r] || []).map(norm);
    const date = cells.findIndex((c) => c === "дата");
    const sum = cells.findIndex((c) => c === "сумма");
    const statya = cells.findIndex((c) => c === "статья");
    if (date >= 0 && sum >= 0 && statya >= 0) return { headerRow: r, date, sum, statya };
  }
  return null;
}

/** Find the tab containing the ledger (override via GOOGLE_SHEETS_DDS_TAB). */
async function resolveLedgerTab(spreadsheetId: string): Promise<{ tab: string; rows: string[][]; cols: ReturnType<typeof findLedger> }> {
  const override = process.env.GOOGLE_SHEETS_DDS_TAB;
  const titles = override ? [override] : await listSheetTitles(spreadsheetId);
  for (const tab of titles) {
    const rows = await readValuesFrom(spreadsheetId, tab, "A1:N5000");
    const cols = findLedger(rows);
    if (cols) return { tab, rows, cols };
  }
  throw new Error("ДДС ledger tab not found (no sheet has Дата/Сумма/Статья header)");
}

export interface DividendSyncResult {
  tab: string;
  currency: string;
  months: { period: string; usd: number }[];
  rows: number; // dividend rows counted
}

export async function syncDividends(): Promise<DividendSyncResult> {
  const spreadsheetId = ddsSpreadsheetId();
  const { tab, rows, cols } = await resolveLedgerTab(spreadsheetId);
  const { headerRow, date: cDate, sum: cSum, statya: cStatya } = cols!;
  const income = incomeCategories();
  const currency = (process.env.DDS_CURRENCY || "USD").toUpperCase();

  // Accumulate absolute income per period; remember dates for optional FX.
  const byPeriod = new Map<string, number>(); // period → native total
  const datesByPeriod = new Map<string, Set<string>>();
  let counted = 0;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const statya = (row[cStatya] || "").trim();
    if (!income.has(statya)) continue;
    const p = periodOf(row[cDate] || "");
    if (!p) continue;
    const amt = Math.abs(parseNum(row[cSum]));
    if (!amt) continue;
    byPeriod.set(p.period, (byPeriod.get(p.period) || 0) + amt);
    (datesByPeriod.get(p.period) || datesByPeriod.set(p.period, new Set()).get(p.period)!).add(p.iso);
    counted++;
  }

  // Convert to USD. Default ДДС currency is USD (no conversion). If RUB, convert
  // each period's total at the rate of one of its payment dates (close enough
  // for a monthly bucket; resilient via fallback).
  let toUsd = (native: number, _period: string) => native;
  if (currency === "RUB") {
    const allDates = [...datesByPeriod.values()].flatMap((s) => [...s]);
    const rates = await getUsdRubRates(allDates);
    toUsd = (native, period) => {
      const someDate = [...(datesByPeriod.get(period) || [])][0];
      const r = (someDate && rates.get(someDate)) || 95;
      return native / r;
    };
  }

  const months = [...byPeriod.entries()]
    .map(([period, native]) => ({ period, usd: Math.round(toUsd(native, period)) }))
    .filter((m) => m.usd > 0)
    .sort((a, b) => a.period.localeCompare(b.period));

  // Full refresh (mirror the expenses sync): replace all rows, then persist.
  await prisma.$transaction(async (tx) => {
    await tx.monthlyIncome.deleteMany();
    for (const m of months) {
      await tx.monthlyIncome.create({ data: { period: m.period, usd: m.usd, source: "dds" } });
    }
    await tx.syncState.upsert({
      where: { source: "dividends" },
      update: { lastSyncedAt: new Date(), ok: true },
      create: { source: "dividends", lastSyncedAt: new Date(), ok: true },
    });
  });

  return { tab, currency, months, rows: counted };
}
