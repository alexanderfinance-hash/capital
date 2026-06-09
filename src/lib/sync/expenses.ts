/* Sync expenses from the Google Sheet "Отчет" (matrix: categories × periods)
 * into ExpenseMonth + ExpenseCategory (in USD). RUB amounts are converted
 * per-week using the rate at the week's end date (CBR, with fallback). */
import "server-only";
import { prisma } from "../prisma";
import { readValues } from "../sheets";
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

export interface ExpenseSyncResult {
  months: { label: string; value: number }[];
  latestPeriod: string;
  categories: { name: string; value: number }[];
  rateNote: string;
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

  // 2) The report matrix.
  const rows = await readValues(tab, "A1:AH200");
  const headers = rows[0] || [];

  const reportYear =
    Number(headers.map((h) => (h || "").match(/За\s+(\d{4})\s+год/)?.[1]).find(Boolean)) || new Date().getUTCFullYear();

  // Month-summary columns and weekly columns.
  const monthCols: { c: number; year: number; month: number }[] = [];
  const weekCols: { c: number; endISO: string }[] = [];
  for (let c = 1; c < headers.length; c++) {
    const h = (headers[c] || "").trim();
    const ml = MONTH_NUM[h.toLowerCase()];
    if (ml) {
      monthCols.push({ c, year: ml === 12 ? reportYear - 1 : reportYear, month: ml });
      continue;
    }
    const m = h.match(/^(\d{2})\.(\d{2})-(\d{2})\.(\d{2})$/);
    if (m) {
      const endDay = +m[3];
      const endMon = +m[4];
      const year = endMon === 12 ? reportYear - 1 : reportYear;
      weekCols.push({ c, endISO: `${year}-${String(endMon).padStart(2, "0")}-${String(endDay).padStart(2, "0")}` });
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

  // 4) Walk category rows, accumulate USD per month and per category.
  type MonthKey = string; // "YYYY-MM"
  const monthTotal = new Map<MonthKey, number>();
  const monthMeta = new Map<MonthKey, { year: number; month: number }>();
  const catByMonth = new Map<MonthKey, Map<string, number>>();
  // period → parent → subName → usd
  const subByMonth = new Map<MonthKey, Map<string, Map<string, number>>>();

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
      for (const w of weekCols) {
        const mk = weekMonth.get(w.c);
        if (!mk) continue;
        const rub = Math.abs(parseNum(rows[r][w.c]));
        if (!rub) continue;
        const usd = usdOf(rub, w.endISO);
        const key = `${mk.year}-${String(mk.month).padStart(2, "0")}`;
        const pm = subByMonth.get(key)!;
        const sm = pm.get(parent) || pm.set(parent, new Map()).get(parent)!;
        sm.set(name, (sm.get(name) || 0) + usd);
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
    }
  }

  // 5) Keep months in chronological order; last 6.
  const orderedKeys = [...monthMeta.keys()].sort();
  const lastKeys = orderedKeys.slice(-6);
  const latest = lastKeys[lastKeys.length - 1];

  // 6) Persist.
  await prisma.$transaction(async (tx) => {
    await tx.expenseMonth.deleteMany();
    await tx.expenseCategory.deleteMany();
    await tx.expenseSubcategory.deleteMany();

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
          if (value > 0) await tx.expenseSubcategory.create({ data: { period: key, parent, name: subName, value } });
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
  return {
    months: lastKeys.map((k) => ({ label: MONTH_SHORT[monthMeta.get(k)!.month], value: Math.round(monthTotal.get(k) || 0) })),
    latestPeriod: latest,
    categories: [...cm.entries()].map(([name, v]) => ({ name, value: Math.round(v) })).sort((a, b) => b.value - a.value),
    rateNote: usingLive ? "rates resolved (cbr/cache/fallback)" : "fallback rate",
  };
}
