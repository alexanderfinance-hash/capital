/* Sync personal income from the «Отчеты для Алекса» → «Отчет Общий» report.
 *
 * The report is a wide matrix: row «Всего чистая прибыль» (net profit) holds a
 * value per column, where columns are either a WEEK (header «01.06–07.06»,
 * Пн–Вс) or a MONTH total (header «Июнь»/«Май»…). We read that one row and feed
 * the dashboard's income series:
 *   - month columns → MonthlyIncome (period "YYYY-MM")  → monthly расходы chart
 *   - week  columns → WeeklyIncome  (weekEnd "YYYY-MM-DD") → weekly расходы chart
 *
 * Замена дивидендов из ДДС: раньше линию «Доходы» питал syncDividends, теперь —
 * чистая прибыль из этого отчёта. Привязка недель идёт по дате-воскресенью
 * (weekEnd), совпадающей с неделями расходов (тоже Пн–Вс).
 *
 * Цифры в отчёте в долларах ($). Если в каком-то окружении они в рублях —
 * PROFIT_CURRENCY=RUB включит пересчёт по курсу ЦБ на дату периода. */
import "server-only";
import { prisma } from "../prisma";
import { listSheetTitles, readValuesFrom } from "../sheets";
import { getUsdRubRates } from "../fx";

// Файл «Отчеты для Алекса» (расшарен read-only на сервис-аккаунт). Переопредел.
const DEFAULT_PROFIT_ID = "1uGr70lurSAUGZeMzYoj1eVh2WyJNJUfwPsI_ljQTm_g";

export function profitSpreadsheetId(): string {
  return process.env.PROFIT_SHEETS_ID || DEFAULT_PROFIT_ID;
}

function profitRowLabel(): string {
  return (process.env.PROFIT_ROW_LABEL || "Всего чистая прибыль").trim().toLowerCase();
}

/** Base year for the report's headers (they carry no year). Default — текущий
 *  год сервера; переопределяется PROFIT_YEAR на случай прошлогодних отчётов. */
function baseYear(): number {
  const y = Number(process.env.PROFIT_YEAR);
  return Number.isFinite(y) && y > 2000 ? y : new Date().getUTCFullYear();
}

const norm = (s: string | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** Money like "55,799$" / "-3,001$" / "1,722,628$" → number. Comma = разделитель
 *  тысяч (убираем), точка = десятичная. Проценты/пустые → NaN-safe 0 на верхнем
 *  уровне фильтруется. */
function parseMoney(s: string | undefined): number {
  if (s == null) return 0;
  const t = String(s).replace(/[^0-9.,\-]/g, "").replace(/,/g, "");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

const MONTHS_RU: Record<string, number> = {
  январь: 1, января: 1, янв: 1,
  февраль: 2, февраля: 2, фев: 2,
  март: 3, марта: 3, мар: 3,
  апрель: 4, апреля: 4, апр: 4,
  май: 5, мая: 5,
  июнь: 6, июня: 6, июн: 6,
  июль: 7, июля: 7, июл: 7,
  август: 8, августа: 8, авг: 8,
  сентябрь: 9, сентября: 9, сен: 9, сент: 9,
  октябрь: 10, октября: 10, окт: 10,
  ноябрь: 11, ноября: 11, ноя: 11, нояб: 11,
  декабрь: 12, декабря: 12, дек: 12,
};

const WEEK_RE = /^\s*(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})\s*$/;

type ColKind =
  | { type: "week"; weekEnd: string; label: string }
  | { type: "month"; period: string }
  | null;

/** Classify a header cell into a week column, a month-total column, or skip. */
function classifyHeader(raw: string, year: number): ColKind {
  const cell = (raw || "").trim();
  if (!cell) return null;
  const wm = cell.match(WEEK_RE);
  if (wm) {
    const [, d1s, m1s, d2s, m2s] = wm;
    const m1 = Number(m1s);
    const m2 = Number(m2s);
    const p = (n: number) => String(n).padStart(2, "0");
    // Неделя может перетекать через Новый год (30.12–05.01): конец — в year+1.
    const endYear = m2 < m1 ? year + 1 : year;
    const weekEnd = `${endYear}-${p(m2)}-${p(Number(d2s))}`;
    const label = `${p(Number(d1s))}.${p(m1)}–${p(Number(d2s))}.${p(m2)}`;
    return { type: "week", weekEnd, label };
  }
  const n = norm(cell);
  // Служебные/итоговые столбцы — пропускаем.
  if (n.includes("сред") || n.includes("итог") || n.includes("квартал") || n === "год") return null;
  const month = MONTHS_RU[n] ?? MONTHS_RU[n.split(" ")[0]];
  if (month) {
    // Год может быть приписан в заголовке («Июнь 2026»); иначе — базовый.
    const ym = n.match(/(20\d{2})/);
    const y = ym ? Number(ym[1]) : year;
    return { type: "month", period: `${y}-${String(month).padStart(2, "0")}` };
  }
  return null;
}

/** Find the header row (within the first rows) carrying the week/month columns —
 *  the one with the most classifiable headers. */
function findHeaderRow(rows: string[][], year: number): number {
  let best = -1;
  let bestScore = 0;
  for (let r = 0; r < Math.min(rows.length, 12); r++) {
    const cells = rows[r] || [];
    let score = 0;
    for (const c of cells) if (classifyHeader(c, year)) score++;
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore >= 2 ? best : -1;
}

/** Find the row whose first non-empty cell matches «Всего чистая прибыль». */
function findLabelRow(rows: string[][], label: string): number {
  for (let r = 0; r < rows.length; r++) {
    const cells = rows[r] || [];
    for (let c = 0; c < Math.min(cells.length, 3); c++) {
      const v = norm(cells[c]);
      if (v && (v === label || v.includes(label))) return r;
    }
  }
  return -1;
}

async function resolveTab(spreadsheetId: string): Promise<{ tab: string; rows: string[][] }> {
  const override = process.env.PROFIT_SHEETS_TAB;
  const titles = override ? [override] : await listSheetTitles(spreadsheetId);
  // Если задан override — берём его; иначе предпочитаем лист, в названии которого
  // есть «отчет общ», затем любой подходящий.
  const ordered = override
    ? titles
    : [...titles].sort((a, b) => {
        const sa = norm(a).includes("отчет общ") ? 0 : 1;
        const sb = norm(b).includes("отчет общ") ? 0 : 1;
        return sa - sb;
      });
  const year = baseYear();
  for (const tab of ordered) {
    const rows = await readValuesFrom(spreadsheetId, tab, "A1:CZ300");
    if (findHeaderRow(rows, year) >= 0 && findLabelRow(rows, profitRowLabel()) >= 0) {
      return { tab, rows };
    }
  }
  throw new Error(
    `Не найден лист с заголовками недель/месяцев и строкой «${process.env.PROFIT_ROW_LABEL || "Всего чистая прибыль"}» (проверьте PROFIT_SHEETS_TAB/PROFIT_ROW_LABEL и доступ сервис-аккаунта).`
  );
}

export interface ProfitSyncResult {
  tab: string;
  currency: string;
  rowLabel: string;
  months: { period: string; usd: number }[];
  weeks: { weekEnd: string; label: string; usd: number }[];
}

export async function syncProfit(): Promise<ProfitSyncResult> {
  const spreadsheetId = profitSpreadsheetId();
  const currency = (process.env.PROFIT_CURRENCY || "USD").toUpperCase();
  const year = baseYear();
  const { tab, rows } = await resolveTab(spreadsheetId);

  const headerRow = findHeaderRow(rows, year);
  const labelRow = findLabelRow(rows, profitRowLabel());
  // Fail BEFORE touching the DB so a transient/parse error never wipes data (PRD §7).
  if (headerRow < 0) throw new Error("Строка заголовков (недели/месяцы) не распознана");
  if (labelRow < 0) throw new Error(`Строка «${process.env.PROFIT_ROW_LABEL || "Всего чистая прибыль"}» не найдена`);

  const header = rows[headerRow] || [];
  const valuesRow = rows[labelRow] || [];

  const monthsMap = new Map<string, number>(); // period → usd (native)
  const weeksMap = new Map<string, { label: string; usd: number }>(); // weekEnd → …
  const monthDate = new Map<string, string>(); // period → iso (для FX)
  const weekDate = new Map<string, string>(); // weekEnd → iso (для FX)

  for (let c = 0; c < header.length; c++) {
    const kind = classifyHeader(header[c], year);
    if (!kind) continue;
    const val = parseMoney(valuesRow[c]);
    if (!val) continue; // пустые/нулевые столбцы пропускаем
    if (kind.type === "month") {
      monthsMap.set(kind.period, val);
      monthDate.set(kind.period, `${kind.period}-15`);
    } else {
      weeksMap.set(kind.weekEnd, { label: kind.label, usd: val });
      weekDate.set(kind.weekEnd, kind.weekEnd);
    }
  }

  // Конвертация в USD. По умолчанию отчёт в USD (без пересчёта). Если RUB —
  // делим на курс ЦБ на дату периода/недели.
  let toUsd = (native: number, _iso: string) => native;
  if (currency === "RUB") {
    const dates = [...monthDate.values(), ...weekDate.values()];
    const rates = await getUsdRubRates(dates);
    toUsd = (native, iso) => native / ((iso && rates.get(iso)) || 95);
  }

  const months = [...monthsMap.entries()]
    .map(([period, native]) => ({ period, usd: Math.round(toUsd(native, monthDate.get(period) || "")) }))
    .filter((m) => m.usd !== 0)
    .sort((a, b) => a.period.localeCompare(b.period));

  const weeks = [...weeksMap.entries()]
    .map(([weekEnd, { label, usd }]) => ({ weekEnd, label, usd: Math.round(toUsd(usd, weekDate.get(weekEnd) || "")) }))
    .filter((w) => w.usd !== 0)
    .sort((a, b) => a.weekEnd.localeCompare(b.weekEnd));

  // Полное обновление (как в синке расходов): заменяем все строки.
  await prisma.$transaction(async (tx) => {
    await tx.monthlyIncome.deleteMany();
    await tx.weeklyIncome.deleteMany();
    if (months.length)
      await tx.monthlyIncome.createMany({ data: months.map((m) => ({ period: m.period, usd: m.usd, source: "profit" })) });
    if (weeks.length)
      await tx.weeklyIncome.createMany({ data: weeks.map((w) => ({ weekEnd: w.weekEnd, label: w.label, usd: w.usd, source: "profit" })) });
    await tx.syncState.upsert({
      where: { source: "profit" },
      update: { lastSyncedAt: new Date(), ok: true },
      create: { source: "profit", lastSyncedAt: new Date(), ok: true },
    });
  });

  return { tab, currency, rowLabel: process.env.PROFIT_ROW_LABEL || "Всего чистая прибыль", months, weeks };
}
