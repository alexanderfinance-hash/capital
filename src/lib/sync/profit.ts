/* Sync personal income (net profit) from the company P&L platform API.
 *
 * Источник — финансовая платформа компании (finance-company.online), эндпоинт
 * /api/integrations/pnl. Раньше «чистая прибыль» тянулась из Google Sheets, теперь
 * из этого API — те же числа, что в разделе P&L платформы.
 *
 * Ответ: { currency, mode, periods:[{key,label}], projects:[{scope,label,hidden,net[]}] }.
 * Берём проект scope="all" («Общий») — консолидированная чистая прибыль по всей
 * компании (не наивная сумма разрезов). net[] выровнен по periods[]. Пишем в те же
 * таблицы, что и раньше:
 *   - mode=month (key "YYYY-MM")     → MonthlyIncome (месячный график «Доходы»)
 *   - mode=week  (key "YYYY-MM-DD")  → WeeklyIncome  (недельный график)
 *
 * Валюта в ответе обычно USD; если RUB — пересчёт по курсу ЦБ на дату периода.
 * Устойчивость (PRD §7): любой сбой запроса/парсинга — throw ДО записи, поэтому
 * последние известные значения дохода не затираются. */
import "server-only";
import { prisma } from "../prisma";
import { getUsdRubRates } from "../fx";

const DEFAULT_PNL_URL = "https://finance-company.online/api/integrations/pnl";
const pnlScope = () => (process.env.PNL_SCOPE || "all").trim();
const pnlPeriods = () => Math.min(60, Math.max(1, Number(process.env.PNL_PERIODS) || 12));

interface PnlPeriod {
  key: string;
  label: string;
}
interface PnlProject {
  scope: string;
  label: string;
  hidden?: boolean;
  net?: number[];
}
interface PnlResponse {
  updatedAt?: string;
  currency?: string;
  mode?: string;
  periods?: PnlPeriod[];
  projects?: PnlProject[];
}

async function fetchPnl(mode: "month" | "week"): Promise<PnlResponse> {
  const base = (process.env.PNL_API_URL || DEFAULT_PNL_URL).replace(/\/+$/, "");
  const token = process.env.PNL_API_TOKEN;
  if (!token) throw new Error("PNL_API_TOKEN не задан — укажите токен финансовой платформы в .env");
  const url = `${base}?mode=${mode}&periods=${pnlPeriods()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`PNL ${mode} HTTP ${res.status}`);
  return (await res.json()) as PnlResponse;
}

/** net[] проекта scope="all" (или PNL_SCOPE), выровненный по periods[]. */
function scopeNet(pnl: PnlResponse): { periods: PnlPeriod[]; net: number[] } {
  const periods = pnl.periods || [];
  const proj = (pnl.projects || []).find((p) => p.scope === pnlScope());
  return { periods, net: proj?.net || [] };
}

export interface ProfitSyncResult {
  source: string;
  currency: string;
  scope: string;
  months: { period: string; usd: number }[];
  weeks: { weekEnd: string; label: string; usd: number }[];
}

export async function syncProfit(): Promise<ProfitSyncResult> {
  const scope = pnlScope();
  // Запрос ДО любой записи (PRD §7). Месяц обязателен; неделя — best-effort.
  const monthPnl = await fetchPnl("month");
  let weekPnl: PnlResponse | null = null;
  try {
    weekPnl = await fetchPnl("week");
  } catch {
    weekPnl = null;
  }

  const currency = (monthPnl.currency || "USD").toUpperCase();

  const m = scopeNet(monthPnl);
  if (!m.net.length) throw new Error(`В ответе PNL нет проекта scope="${scope}" (или пустой net)`);
  const monthsRaw = m.periods
    .map((p, i) => ({ period: p.key, native: Number(m.net[i] ?? 0) }))
    .filter((x) => /^\d{4}-\d{2}$/.test(x.period));

  let weeksRaw: { weekEnd: string; label: string; native: number }[] = [];
  if (weekPnl) {
    const w = scopeNet(weekPnl);
    weeksRaw = w.periods
      .map((p, i) => ({ weekEnd: p.key, label: p.label || p.key, native: Number(w.net[i] ?? 0) }))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.weekEnd));
  }

  // Валюта: обычно USD (без пересчёта). RUB → делим на курс ЦБ на дату периода.
  let toUsd = (n: number, _iso: string) => n;
  if (currency === "RUB") {
    const dates = [...monthsRaw.map((x) => `${x.period}-15`), ...weeksRaw.map((x) => x.weekEnd)];
    const rates = await getUsdRubRates(dates);
    toUsd = (n, iso) => n / ((iso && rates.get(iso)) || 95);
  }

  const months = monthsRaw
    .map((x) => ({ period: x.period, usd: Math.round(toUsd(x.native, `${x.period}-15`)) }))
    .filter((x) => x.usd !== 0)
    .sort((a, b) => a.period.localeCompare(b.period));
  const weeks = weeksRaw
    .map((x) => ({ weekEnd: x.weekEnd, label: x.label, usd: Math.round(toUsd(x.native, x.weekEnd)) }))
    .filter((x) => x.usd !== 0)
    .sort((a, b) => a.weekEnd.localeCompare(b.weekEnd));

  // Полное обновление (как раньше): заменяем все строки дохода.
  await prisma.$transaction(async (tx) => {
    await tx.monthlyIncome.deleteMany();
    await tx.weeklyIncome.deleteMany();
    if (months.length)
      await tx.monthlyIncome.createMany({ data: months.map((mm) => ({ period: mm.period, usd: mm.usd, source: "profit" })) });
    if (weeks.length)
      await tx.weeklyIncome.createMany({ data: weeks.map((ww) => ({ weekEnd: ww.weekEnd, label: ww.label, usd: ww.usd, source: "profit" })) });
    await tx.syncState.upsert({
      where: { source: "profit" },
      update: { lastSyncedAt: new Date(), ok: true },
      create: { source: "profit", lastSyncedAt: new Date(), ok: true },
    });
  });

  return { source: `pnl:${scope}`, currency, scope, months, weeks };
}
