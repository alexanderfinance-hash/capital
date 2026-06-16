/* Sync expenses from the Google Sheet "Отчет" (matrix: categories × periods)
 * into ExpenseMonth + ExpenseCategory (in USD). RUB amounts are converted
 * per-week using the rate at the week's end date (CBR, with fallback). */
import "server-only";
import { prisma } from "../prisma";
import { readValues, readValuesFrom, listSheetTitles } from "../sheets";
import { getUsdRubRates } from "../fx";

const MONTH_NUM: Record<string, number> = {
  январь: 1, февраль: 2, март: 3, апрель: 4, май: 5, июнь: 6,
  июль: 7, август: 8, сентябрь: 9, октябрь: 10, ноябрь: 11, декабрь: 12,
};
const MONTH_SHORT = ["", "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function parseNum(s: string | undefined): number {
  if (s == null) return 0;
  const t = String(s).replace(/[^\d.,\-]/g, "").replace(",", ".");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}

function excludeSet(): Set<string> {
  const raw = process.env.EXPENSE_EXCLUDE ?? "Снятие наличных,Обналичивание крипты";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

/** Subcategories (Подстатья) reclassified from expenses to investments — pulled
 *  out of the expense totals and shown separately on Инвестиции (e.g. coaching /
 *  education, which can't be sold). Comma-separated; matched by exact name.
 *
 *  OFF by default: expenses mirror the sheet 1:1. Enable with
 *  EXPENSE_RECLASSIFY_INVESTMENTS=true (then EXPENSE_AS_INVESTMENT lists which
 *  подстатьи to move). Gating behind a flag means a stale EXPENSE_AS_INVESTMENT
 *  left in a server .env no longer silently subtracts from expenses. */
function investSubcatSet(): Set<string> {
  if ((process.env.EXPENSE_RECLASSIFY_INVESTMENTS || "").toLowerCase() !== "true") return new Set();
  const raw = process.env.EXPENSE_AS_INVESTMENT ?? "Коучи\\преподаватели\\наставники";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

/** "24.12.2025" → { period: "2025-12", iso: "2025-12-24" }. */
function periodOfDate(date: string): { period: string; iso: string } | null {
  const m = (date || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = m[2].padStart(2, "0");
  return { period: `${m[3]}-${month}`, iso: `${m[3]}-${month}-${day}` };
}

interface DdsCols {
  headerRow: number;
  date: number;
  sum: number;
  comment: number;
  statya: number;
  podstatya: number;
}

/** Locate the ДДС ledger header (Дата/Сумма/Статья/Подстатья) + comment column.
 *  Comment defaults to column H (index 7) if no "Комментарий" header is found. */
function findDdsCols(rows: string[][]): DdsCols | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = (rows[r] || []).map((c) => (c || "").trim().toLowerCase());
    const date = cells.findIndex((c) => c === "дата");
    const sum = cells.findIndex((c) => c === "сумма");
    const statya = cells.findIndex((c) => c === "статья");
    const podstatya = cells.findIndex((c) => c === "подстатья");
    if (date >= 0 && sum >= 0 && statya >= 0 && podstatya >= 0) {
      let comment = cells.findIndex((c) => c.includes("коммент"));
      if (comment < 0) comment = 7; // столбец H
      return { headerRow: r, date, sum, comment, statya, podstatya };
    }
  }
  return null;
}

/** Read the ДДС ledger (flat payment journal) from the same spreadsheet as the
 *  report. The ledger tab is auto-discovered (override via
 *  GOOGLE_SHEETS_DDS_LEDGER_TAB). Returns null if not found — drill-down then
 *  simply stays empty and the sync still succeeds. */
async function readDdsLedger(): Promise<(DdsCols & { rows: string[][] }) | null> {
  const id = process.env.GOOGLE_SHEETS_ID;
  if (!id) return null;
  const override = process.env.GOOGLE_SHEETS_DDS_LEDGER_TAB;
  const titles = override ? [override] : await listSheetTitles(id);
  for (const tab of titles) {
    const rows = await readValuesFrom(id, tab, "A1:N5000");
    const cols = findDdsCols(rows);
    if (cols) return { ...cols, rows };
  }
  return null;
}

/** Scale raw payment amounts so they sum exactly to `target` (the subcategory's
 *  USD total from the report) — sidesteps currency/rate questions and keeps the
 *  payments consistent with the displayed subtotal. */
function calibrate(txns: { date: string; comment: string; raw: number }[], target: number) {
  const rawSum = txns.reduce((s, t) => s + t.raw, 0);
  if (rawSum <= 0) return [];
  const out = txns.map((t) => ({ date: t.date, comment: t.comment, value: Math.round((t.raw / rawSum) * target) }));
  let diff = target - out.reduce((s, t) => s + t.value, 0);
  if (diff !== 0 && out.length) {
    let bi = 0;
    for (let i = 1; i < out.length; i++) if (out[i].value > out[bi].value) bi = i;
    out[bi].value += diff;
  }
  return out;
}

export interface ExpenseSyncResult {
  months: { label: string; value: number }[];
  latestPeriod: string;
  categories: { name: string; value: number }[];
  rateNote: string;
  investmentsReclassified?: number;
}

export async function syncExpenses(): Promise<ExpenseSyncResult> {
  const tab = process.env.GOOGLE_SHEETS_EXPENSES_TAB || "Отчет";
  const catTab = process.env.GOOGLE_SHEETS_CATEGORIES_TAB || "Категории ";

  // 1) Categories (Статья) and subcategories (Подстатья) from the Категории sheet.
  const catRows = await readValues(catTab, "A1:C200");
  const statyaSet = new Set<string>();
  const subToParent = new Map<string, string>(); // Подстатья → Статья (Расход)
  for (let i = 1; i < catRows.length; i++) {
    const [statya, podstatya, type] = catRows[i] || [];
    if (statya && (type || "").trim() === "Расход") {
      statyaSet.add(statya.trim());
      const sub = (podstatya || "").trim();
      // Skip subs whose name equals the parent (avoids double counting header rows).
      if (sub && sub !== statya.trim() && !subToParent.has(sub)) subToParent.set(sub, statya.trim());
    }
  }
  const exclude = excludeSet();
  const investSubcats = investSubcatSet();

  // 2) The report matrix. The range must be wide enough to reach the NEWEST
  //    period columns: the sheet grows left→right (a month-summary column plus
  //    ~4-5 week columns per month), so a year easily exceeds column AH (34).
  //    Reading too few columns silently drops the latest weeks/months — which
  //    looked like "the sync isn't updating". Read generously.
  const rows = await readValues(tab, "A1:CZ300");
  const headers = rows[0] || [];

  const reportYear =
    Number(headers.map((h) => (h || "").match(/За\s+(\d{4})\s+год/)?.[1]).find(Boolean)) || new Date().getUTCFullYear();

  // Month-summary columns and weekly columns.
  const monthCols: { c: number; year: number; month: number }[] = [];
  const weekCols: { c: number; endISO: string; startISO: string }[] = [];
  for (let c = 1; c < headers.length; c++) {
    const h = (headers[c] || "").trim();
    const ml = MONTH_NUM[h.toLowerCase()];
    if (ml) {
      monthCols.push({ c, year: ml === 12 ? reportYear - 1 : reportYear, month: ml });
      continue;
    }
    const m = h.match(/^(\d{2})\.(\d{2})-(\d{2})\.(\d{2})$/);
    if (m) {
      const startDay = +m[1];
      const startMon = +m[2];
      const endDay = +m[3];
      const endMon = +m[4];
      const endYear = endMon === 12 ? reportYear - 1 : reportYear;
      const startYear = startMon === 12 ? reportYear - 1 : reportYear;
      weekCols.push({
        c,
        endISO: `${endYear}-${String(endMon).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
        startISO: `${startYear}-${String(startMon).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`,
      });
    }
  }

  // Assign each week to the nearest month-summary column to its right.
  const weekMonth = new Map<number, { year: number; month: number }>();
  for (const w of weekCols) {
    const mc = monthCols.find((x) => x.c > w.c) || monthCols[monthCols.length - 1];
    if (mc) weekMonth.set(w.c, { year: mc.year, month: mc.month });
  }

  // 3) FX rates for all week-end dates.
  const rates = await getUsdRubRates(weekCols.map((w) => w.endISO));
  const usdOf = (rub: number, endISO: string) => {
    const r = rates.get(endISO) || 95;
    return rub / r;
  };

  // 4) Walk category rows, accumulate USD per month, per week, and per category.
  type MonthKey = string; // "YYYY-MM"
  const monthTotal = new Map<MonthKey, number>();
  const monthMeta = new Map<MonthKey, { year: number; month: number }>();
  const catByMonth = new Map<MonthKey, Map<string, number>>();
  // period → parent → subName → usd
  const subByMonth = new Map<MonthKey, Map<string, Map<string, number>>>();

  // Weekly accumulators: weekEnd ISO → total USD, categories, subcategories
  const weekTotal = new Map<string, number>();
  const catByWeek = new Map<string, Map<string, number>>();
  const subByWeek = new Map<string, Map<string, Map<string, number>>>();
  // Initialise week buckets
  for (const w of weekCols) {
    weekTotal.set(w.endISO, 0);
    catByWeek.set(w.endISO, new Map());
    subByWeek.set(w.endISO, new Map());
  }
  // Reclassified-as-investment subcategories (kept out of expenses entirely).
  // period → total usd, and period → parent → usd (to deduct from category totals).
  const investTotalByMonth = new Map<MonthKey, number>();
  const investParentByMonth = new Map<MonthKey, Map<string, number>>();
  // period → "parent||name" → { parent, name, usd } for the breakdown rows.
  const investRows = new Map<MonthKey, Map<string, { parent: string; name: string; usd: number }>>();

  for (const mc of monthCols) {
    const key = `${mc.year}-${String(mc.month).padStart(2, "0")}`;
    monthMeta.set(key, { year: mc.year, month: mc.month });
    monthTotal.set(key, 0);
    catByMonth.set(key, new Map());
    subByMonth.set(key, new Map());
  }

  for (let r = 1; r < rows.length; r++) {
    const name = (rows[r]?.[0] || "").trim();

    // Subcategory row → attribute to its parent (for the expandable tree).
    const parent = subToParent.get(name);
    if (parent && !exclude.has(parent)) {
      const isInvest = investSubcats.has(name);
      for (const w of weekCols) {
        const mk = weekMonth.get(w.c);
        if (!mk) continue;
        const rub = Math.abs(parseNum(rows[r][w.c]));
        if (!rub) continue;
        const usd = usdOf(rub, w.endISO);
        const key = `${mk.year}-${String(mk.month).padStart(2, "0")}`;
        if (isInvest) {
          // Reclassified as investment: keep out of the expense tree; remember it
          // so we can deduct it from the parent category + month totals below.
          investTotalByMonth.set(key, (investTotalByMonth.get(key) || 0) + usd);
          const ipm = investParentByMonth.get(key) || investParentByMonth.set(key, new Map()).get(key)!;
          ipm.set(parent, (ipm.get(parent) || 0) + usd);
          const irm = investRows.get(key) || investRows.set(key, new Map()).get(key)!;
          const rk = `${parent}||${name}`;
          const prev = irm.get(rk);
          irm.set(rk, { parent, name, usd: (prev?.usd || 0) + usd });
          continue;
        }
        const pm = subByMonth.get(key)!;
        const sm = pm.get(parent) || pm.set(parent, new Map()).get(parent)!;
        sm.set(name, (sm.get(name) || 0) + usd);
        // Weekly subcategory accumulation
        const wpm = subByWeek.get(w.endISO)!;
        const wsm = wpm.get(parent) || wpm.set(parent, new Map()).get(parent)!;
        wsm.set(name, (wsm.get(name) || 0) + usd);
      }
    }

    if (!name || !statyaSet.has(name) || exclude.has(name)) continue;
    for (const w of weekCols) {
      const mk = weekMonth.get(w.c);
      if (!mk) continue;
      const rub = Math.abs(parseNum(rows[r][w.c]));
      if (!rub) continue;
      const usd = usdOf(rub, w.endISO);
      const key = `${mk.year}-${String(mk.month).padStart(2, "0")}`;
      monthTotal.set(key, (monthTotal.get(key) || 0) + usd);
      const cm = catByMonth.get(key)!;
      cm.set(name, (cm.get(name) || 0) + usd);
      // Weekly accumulation
      weekTotal.set(w.endISO, (weekTotal.get(w.endISO) || 0) + usd);
      const wm = catByWeek.get(w.endISO)!;
      wm.set(name, (wm.get(name) || 0) + usd);
    }
  }

  // 4b) Deduct reclassified-as-investment subcategories from the expense totals.
  // The Статья (category) row in the sheet sums its подстатьи, so the coaching
  // amount is baked into both the month total and the parent category — remove
  // it so the расходы chart reflects true spending (clamped at 0 for safety).
  for (const [key, ipm] of investParentByMonth) {
    const total = investTotalByMonth.get(key) || 0;
    monthTotal.set(key, Math.max(0, (monthTotal.get(key) || 0) - total));
    const cm = catByMonth.get(key);
    if (cm) {
      for (const [parent, usd] of ipm) {
        if (cm.has(parent)) cm.set(parent, Math.max(0, (cm.get(parent) || 0) - usd));
      }
    }
  }

  // 4c) Deduct reclassified investments from weekly totals/categories too.
  // We track which weekCols belong to which invest subcats and subtract accordingly.
  // Re-walk rows to find invest subcat weekly amounts and deduct.
  for (let r = 1; r < rows.length; r++) {
    const name = (rows[r]?.[0] || "").trim();
    const parent = subToParent.get(name);
    if (!parent || !investSubcats.has(name)) continue;
    for (const w of weekCols) {
      const rub = Math.abs(parseNum(rows[r][w.c]));
      if (!rub) continue;
      const usd = usdOf(rub, w.endISO);
      weekTotal.set(w.endISO, Math.max(0, (weekTotal.get(w.endISO) || 0) - usd));
      const wm = catByWeek.get(w.endISO);
      if (wm && wm.has(parent)) wm.set(parent, Math.max(0, (wm.get(parent) || 0) - usd));
    }
  }

  // 5) Keep months in chronological order; last 6.
  const orderedKeys = [...monthMeta.keys()].sort();
  const lastKeys = orderedKeys.slice(-6);
  const latest = lastKeys[lastKeys.length - 1];

  // 5b) Keep weeks in chronological order; last 12.
  const orderedWeeks = weekCols.map((w) => w.endISO).sort();
  const lastWeeks = orderedWeeks.slice(-12);

  // 5c) ДДС ledger → individual payments per subcategory (for the drill-down).
  // Keyed by "period||Статья||Подстатья" (monthly) and "weekEnd||..." (weekly);
  // each entry keeps the raw amount + comment + date. Calibrated at persist time
  // so payments sum to the subcategory total. Optional: if the ledger isn't
  // found/readable the sync still succeeds with an empty drill-down.
  type Tx = { date: string; comment: string; raw: number };
  const txMonth = new Map<string, Tx[]>();
  const txWeek = new Map<string, Tx[]>();
  const lastKeySet = new Set(lastKeys);
  const lastWeekSet = new Set(lastWeeks);
  const findWeekEnd = (iso: string): string | undefined =>
    weekCols.find((w) => w.startISO <= iso && iso <= w.endISO)?.endISO;
  try {
    const led = await readDdsLedger();
    if (led) {
      for (let r = led.headerRow + 1; r < led.rows.length; r++) {
        const row = led.rows[r] || [];
        const sub = (row[led.podstatya] || "").trim();
        if (!sub) continue;
        const parent = subToParent.get(sub);
        // Only known expense subcategories (excludes income, transfers, and
        // подстатьи reclassified as investments — these have no expense subtotal).
        if (!parent || exclude.has(parent) || investSubcats.has(sub)) continue;
        const p = periodOfDate(row[led.date] || "");
        if (!p) continue;
        const raw = Math.abs(parseNum(row[led.sum]));
        if (!raw) continue;
        const t: Tx = { date: p.iso, comment: (row[led.comment] || "").trim(), raw };
        if (lastKeySet.has(p.period)) {
          const k = `${p.period}||${parent}||${sub}`;
          (txMonth.get(k) || txMonth.set(k, []).get(k)!).push(t);
        }
        const we = findWeekEnd(p.iso);
        if (we && lastWeekSet.has(we)) {
          const k = `${we}||${parent}||${sub}`;
          (txWeek.get(k) || txWeek.set(k, []).get(k)!).push(t);
        }
      }
    }
  } catch {
    /* ledger optional — drill-down stays empty, never fails the sync */
  }

  // 6) Persist.
  await prisma.$transaction(async (tx) => {
    await tx.expenseMonth.deleteMany();
    await tx.expenseCategory.deleteMany();
    await tx.expenseSubcategory.deleteMany();
    await tx.otherInvestment.deleteMany();
    await tx.expenseWeek.deleteMany();
    await tx.expenseWeekCategory.deleteMany();
    await tx.expenseWeekSubcategory.deleteMany();
    await tx.expenseTransaction.deleteMany();
    await tx.expenseWeekTransaction.deleteMany();

    // Reclassified investments (e.g. coaching/education) — stored for ALL months
    // of the report, not just the shown window, so large one-off payments show
    // up on Инвестиции even if older than the 6-month expense window.
    for (const [period, irm] of investRows) {
      for (const { parent, name, usd } of irm.values()) {
        const value = Math.round(usd);
        if (value > 0) await tx.otherInvestment.create({ data: { period, parent, name, value } });
      }
    }

    for (const key of lastKeys) {
      const meta = monthMeta.get(key)!;
      await tx.expenseMonth.create({
        data: {
          label: MONTH_SHORT[meta.month],
          monthStart: new Date(Date.UTC(meta.year, meta.month - 1, 1)),
          value: Math.round(monthTotal.get(key) || 0),
        },
      });
    }

    // Category breakdown for EVERY shown month so the UI can switch months by
    // clicking the bars. Categories mirror the sheet 1:1 — no synthetic
    // "Прочее" bucket (the sheet has no such row).
    for (const key of lastKeys) {
      const cm = catByMonth.get(key) || new Map<string, number>();
      const sorted = [...cm.entries()].map(([name, v]) => ({ name, value: Math.round(v) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
      for (const c of sorted) {
        await tx.expenseCategory.create({ data: { period: key, name: c.name, value: c.value } });
      }
    }

    // Subcategory breakdown per month (for the expandable tree).
    for (const key of lastKeys) {
      const pm = subByMonth.get(key);
      if (!pm) continue;
      for (const [parent, sm] of pm) {
        if (exclude.has(parent)) continue;
        for (const [subName, v] of sm) {
          const value = Math.round(v);
          if (value <= 0) continue;
          await tx.expenseSubcategory.create({ data: { period: key, parent, name: subName, value } });
          // Individual payments (calibrated to the subcategory total).
          const payments = txMonth.get(`${key}||${parent}||${subName}`);
          if (payments && payments.length) {
            for (const t of calibrate(payments, value)) {
              await tx.expenseTransaction.create({ data: { period: key, parent, sub: subName, date: t.date, comment: t.comment, value: t.value } });
            }
          }
        }
      }
    }

    // Weekly totals and categories (last 12 weeks)
    for (const endISO of lastWeeks) {
      const wCol = weekCols.find((w) => w.endISO === endISO);
      if (!wCol) continue;
      const rawHeader = (rows[0][wCol.c] || "").trim(); // "01.06-07.06"
      const label = rawHeader.replace("-", "–"); // en-dash
      const value = Math.round(weekTotal.get(endISO) || 0);
      await tx.expenseWeek.create({ data: { label, weekEnd: endISO, value } });
      const wm = catByWeek.get(endISO) || new Map<string, number>();
      const sortedCats = [...wm.entries()].map(([name, v]) => ({ name, value: Math.round(v) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
      for (const c of sortedCats) {
        await tx.expenseWeekCategory.create({ data: { weekEnd: endISO, name: c.name, value: c.value } });
      }
      // Weekly subcategories
      const wpm = subByWeek.get(endISO);
      if (wpm) {
        for (const [parent, wsm] of wpm) {
          if (exclude.has(parent)) continue;
          for (const [subName, v] of wsm) {
            const value = Math.round(v);
            if (value <= 0) continue;
            await tx.expenseWeekSubcategory.create({ data: { weekEnd: endISO, parent, name: subName, value } });
            const payments = txWeek.get(`${endISO}||${parent}||${subName}`);
            if (payments && payments.length) {
              for (const t of calibrate(payments, value)) {
                await tx.expenseWeekTransaction.create({ data: { weekEnd: endISO, parent, sub: subName, date: t.date, comment: t.comment, value: t.value } });
              }
            }
          }
        }
      }
    }

    await tx.syncState.upsert({
      where: { source: "sheets" },
      update: { lastSyncedAt: new Date(), ok: true },
      create: { source: "sheets", lastSyncedAt: new Date(), ok: true },
    });
  });

  const cm = catByMonth.get(latest) || new Map();
  const usingLive = [...rates.values()].length > 0;
  const investTotal = [...investTotalByMonth.values()].reduce((s, v) => s + v, 0);
  return {
    months: lastKeys.map((k) => ({ label: MONTH_SHORT[monthMeta.get(k)!.month], value: Math.round(monthTotal.get(k) || 0) })),
    latestPeriod: latest,
    categories: [...cm.entries()].map(([name, v]) => ({ name, value: Math.round(v) })).sort((a, b) => b.value - a.value),
    rateNote: usingLive ? "rates resolved (cbr/cache/fallback)" : "fallback rate",
    investmentsReclassified: Math.round(investTotal),
  };
}
