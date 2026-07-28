/* РЕТИРЕД. Раньше этот синк тянул «Дивиденды» из ДДС-листа Google Sheets и писал их
 * в MonthlyIncome как «доход». Теперь источник дохода — ЧИСТАЯ ПРИБЫЛЬ из P&L-API
 * финансовой платформы (см. sync/profit.ts). Обе функции делали
 * `monthlyIncome.deleteMany()` и ПЕРЕЗАТИРАЛИ друг друга — из-за чего на дашборде
 * месячный доход показывал дивиденды вместо чистой прибыли. Поэтому здесь оставлен
 * НО-ОП: ничего не читает и не пишет. Роут /api/sync/dividends сохранён для обратной
 * совместимости (например, если старый воркер ещё дёргает его), но он больше не
 * мутирует данные. Единственный писатель MonthlyIncome/WeeklyIncome — sync/profit. */
import "server-only";

const DEFAULT_DDS_ID = "1fwMFtSgOUdSfmgVS3SwrYpFvwsxiPBXpL0SBVLdlaLs";

export function ddsSpreadsheetId(): string {
  return process.env.GOOGLE_SHEETS_DDS_ID || DEFAULT_DDS_ID;
}

export interface DividendSyncResult {
  deprecated: true;
  note: string;
  months: never[];
  rows: 0;
}

/** Ничего не делает (ретиред). Доход = чистая прибыль из P&L-API (sync/profit). */
export async function syncDividends(): Promise<DividendSyncResult> {
  return {
    deprecated: true,
    note: "Синк дивидендов из ДДС отключён: доход берётся из P&L-API (чистая прибыль), см. /api/sync/profit.",
    months: [],
    rows: 0,
  };
}
