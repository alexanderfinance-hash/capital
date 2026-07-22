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

const sumArr = (a?: number[]) => (a || []).reduce((s, v) => s + (Number(v) || 0), 0);

/** Санити-защита от глюка пересчёта. Платформа считает P&L «на лету» и изредка
 *  (в момент пересчёта) отдаёт консолидированный net (scope="all") отрицательным,
 *  хотя выручка стабильно положительна и в UI все месяцы «+». Здоровое состояние:
 *  all за период уверенно > 0 (напр. +837K за 6 мес при выручке ~1.02M). Глюк:
 *  all ≤ 0 при положительных revenue-разрезах — тогда throw (PRD §7: оставляем
 *  последние известные значения, не пишем глюк). */
function assertPnlSane(pnl: PnlResponse, mode: string): void {
  const projects = pnl.projects || [];
  const allTotal = sumArr(projects.find((p) => p.scope === pnlScope())?.net);
  const posScopes = projects
    .filter((p) => p.scope !== pnlScope())
    .reduce((s, p) => s + Math.max(0, sumArr(p.net)), 0);
  if (allTotal <= 0 && posScopes > 0) {
    throw new Error(
      `P&L glitch (${mode}): scope="${pnlScope()}" total=${Math.round(allTotal)} ≤ 0 при положительной выручке ${Math.round(
        posScopes
      )} — пропускаем синк, оставляем прошлые значения`
    );
  }
}

/** Платформа считает P&L «на лету» (updatedAt меняется на каждый запрос) и может
 *  кратковременно вернуть некорректные значения (в момент пересчёта). Поэтому берём
 *  ответ, только если scope-net СОВПАДАЕТ в двух последовательных запросах; иначе —
 *  throw (PRD §7: оставляем последние известные значения, а не пишем глюк). */
async function fetchPnlStable(mode: "month" | "week"): Promise<PnlResponse> {
  const key = (r: PnlResponse) => JSON.stringify(scopeNet(r).net.map((v) => Math.round(Number(v) || 0)));
  const a = await fetchPnl(mode);
  const b = await fetchPnl(mode);
  if (key(a) !== "[]" && key(a) === key(b)) {
    assertPnlSane(b, mode);
    return b;
  }
  const c = await fetchPnl(mode); // ещё одна попытка, если первые два разошлись
  if (key(b) !== "[]" && key(b) === key(c)) {
    assertPnlSane(c, mode);
    return c;
  }
  throw new Error(`P&L API нестабилен по scope="${pnlScope()}" (${mode}) — значения расходятся между запросами`);
}

// Ключ недели у API — диапазон "DD.MM-DD.MM" без года. Конец диапазона (воскресенье)
// переводим в weekEnd "YYYY-MM-DD". Год проставляем, идя от самой свежей недели
// назад: если у более ранней недели месяц больше следующей — пересекли Новый год.
const WEEK_RE = /^\s*(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})\s*$/;
function weekEndsFor(periods: PnlPeriod[]): (string | null)[] {
  const now = new Date();
  const nowY = now.getUTCFullYear();
  const nowM = now.getUTCMonth() + 1;
  const parsed = periods.map((p) => {
    const m = (p.key || "").match(WEEK_RE);
    return m ? { d2: Number(m[3]), mo2: Number(m[4]) } : null;
  });
  const out: (string | null)[] = new Array(periods.length).fill(null);
  const idxs = parsed.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  if (!idxs.length) return out;
  const lastIdx = idxs[idxs.length - 1];
  // Год самой свежей недели: если её конечный месяц заметно больше текущего — прошлый год.
  let year = parsed[lastIdx]!.mo2 > nowM + 1 ? nowY - 1 : nowY;
  let prevMo = parsed[lastIdx]!.mo2;
  const p2 = (n: number) => String(n).padStart(2, "0");
  for (let i = lastIdx; i >= 0; i--) {
    const x = parsed[i];
    if (!x) continue;
    if (x.mo2 > prevMo) year -= 1;
    prevMo = x.mo2;
    out[i] = `${year}-${p2(x.mo2)}-${p2(x.d2)}`;
  }
  return out;
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
  const monthPnl = await fetchPnlStable("month");
  let weekPnl: PnlResponse | null = null;
  try {
    weekPnl = await fetchPnlStable("week");
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
    const ends = weekEndsFor(w.periods); // "DD.MM-DD.MM" → weekEnd "YYYY-MM-DD" (вс)
    weeksRaw = w.periods
      .map((p, i) => ({ weekEnd: ends[i], label: p.label || p.key, native: Number(w.net[i] ?? 0) }))
      .filter((x): x is { weekEnd: string; label: string; native: number } => !!x.weekEnd);
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
