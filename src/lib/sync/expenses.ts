/* Sync personal expenses directly from the ДДС ledger (the flat payment journal
 * in the "Личные финансы" spreadsheet) — no dependency on the pre-aggregated
 * "Отчет" matrix, so the owner doesn't have to maintain weekly columns there and
 * the dashboard always mirrors the raw journal.
 *
 * Every figure is built by summing individual payments up the tree
 * (payment → Подстатья → Статья → period/week total), so totals are internally
 * consistent at every level. RUB→USD uses a single current CBR rate, matching the
 * rate the UI uses to display ₽, so ₽ figures track the sheet. */
import "server-only";
import { prisma } from "../prisma";
import { readValues, readValuesFrom, listSheetTitles } from "../sheets";
import { getCurrentUsdRub } from "../fx";

const MONTH_SHORT = ["", "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const round2 = (n: number): number => Math.round(n * 100) / 100;

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

/** Подстатьи reclassified from expenses to investments (shown on Инвестиции,
 *  pulled out of expense totals). OFF by default — expenses mirror the ledger
 *  1:1. Enable with EXPENSE_RECLASSIFY_INVESTMENTS=true. */
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

/** Week (Mon–Sun, matching the "Отчет" week columns like 01.06–07.06) that
 *  contains the given ISO date. */
function weekOf(iso: string): { weekEnd: string; label: string } {
  const d = new Date(iso + "T00:00:00Z");
  const fromMonday = (d.getUTCDay() + 6) % 7; // Пн→0, Вт→1 … Вс→6
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - fromMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const p = (n: number) => String(n).padStart(2, "0");
  const weekEnd = `${end.getUTCFullYear()}-${p(end.getUTCMonth() + 1)}-${p(end.getUTCDate())}`;
  const label = `${p(start.getUTCDate())}.${p(start.getUTCMonth() + 1)}–${p(end.getUTCDate())}.${p(end.getUTCMonth() + 1)}`;
  return { weekEnd, label };
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

/** Read the ДДС ledger from the same spreadsheet as the report. Tab is
 *  auto-discovered (override via GOOGLE_SHEETS_DDS_LEDGER_TAB). */
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

export interface ExpenseSyncResult {
  months: { label: string; value: number }[];
  latestPeriod: string;
  categories: { name: string; value: number }[];
  rateNote: string;
  investmentsReclassified?: number;
}

type Tx = { date: string; comment: string; value: number };
// period|weekEnd → Статья → Подстатья → платежи (USD, округл. до центов)
type Tree = Map<string, Map<string, Map<string, Tx[]>>>;

function pushTx(root: Tree, key: string, statya: string, sub: string, tx: Tx) {
  const a = root.get(key) || root.set(key, new Map()).get(key)!;
  const b = a.get(statya) || a.set(statya, new Map()).get(statya)!;
  (b.get(sub) || b.set(sub, []).get(sub)!).push(tx);
}

/** Derive consistent category/subcategory totals by summing the (already
 *  rounded) payments — so total = Σ categories = Σ subs = Σ payments. */
function catList(byStatya: Map<string, Map<string, Tx[]>> | undefined) {
  if (!byStatya) return [];
  return [...byStatya.entries()]
    .map(([name, subsMap]) => {
      const subs = [...subsMap.entries()]
        .map(([sub, txns]) => ({ sub, value: round2(txns.reduce((s, t) => s + t.value, 0)), txns }))
        .filter((x) => x.value > 0)
        .sort((a, b) => b.value - a.value);
      const value = round2(subs.reduce((s, x) => s + x.value, 0));
      return { name, value, subs };
    })
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

export async function syncExpenses(): Promise<ExpenseSyncResult> {
  const exclude = excludeSet();
  const investSubcats = investSubcatSet();
  const rate = (await getCurrentUsdRub()) || 95; // RUB per 1 USD — единый текущий курс

  // Expense Статьи (type "Расход") from the Категории sheet — used to tell
  // expenses from income/transfers regardless of the sign convention in ДДС.
  const catTab = process.env.GOOGLE_SHEETS_CATEGORIES_TAB || "Категории ";
  const catRows = await readValues(catTab, "A1:C300");
  const statyaSet = new Set<string>();
  for (let i = 1; i < catRows.length; i++) {
    const [statya, , type] = catRows[i] || [];
    if (statya && (type || "").trim() === "Расход") statyaSet.add(statya.trim());
  }

  const led = await readDdsLedger();
  // Fail BEFORE touching the DB so a transient read error never wipes data (PRD §7).
  if (!led) throw new Error("ДДС ledger not found (нет листа с колонками Дата/Сумма/Статья/Подстатья)");
  if (statyaSet.size === 0) throw new Error("Категории расходов не прочитаны (лист Категории пуст?)");

  const monthTx: Tree = new Map();
  const weekTx: Tree = new Map();
  const weekLabel = new Map<string, string>();
  // Реклассифицированные в инвестиции (если включён флаг): period → Статья → Подстатья → usd
  const investAgg = new Map<string, Map<string, Map<string, number>>>();
  let investTotal = 0;

  for (let r = led.headerRow + 1; r < led.rows.length; r++) {
    const row = led.rows[r] || [];
    const statya = (row[led.statya] || "").trim();
    if (!statya || !statyaSet.has(statya) || exclude.has(statya)) continue;
    const p = periodOfDate(row[led.date] || "");
    if (!p) continue;
    const rub = Math.abs(parseNum(row[led.sum]));
    if (!rub) continue;
    const usd = round2(rub / rate);
    if (usd <= 0) continue;
    const sub = (row[led.podstatya] || "").trim() || statya;

    if (investSubcats.has(sub)) {
      investTotal += usd;
      const a = investAgg.get(p.period) || investAgg.set(p.period, new Map()).get(p.period)!;
      const b = a.get(statya) || a.set(statya, new Map()).get(statya)!;
      b.set(sub, round2((b.get(sub) || 0) + usd));
      continue;
    }

    const tx: Tx = { date: p.iso, comment: (row[led.comment] || "").trim(), value: usd };
    pushTx(monthTx, p.period, statya, sub, tx);
    const wk = weekOf(p.iso);
    weekLabel.set(wk.weekEnd, wk.label);
    pushTx(weekTx, wk.weekEnd, statya, sub, tx);
  }

  const lastKeys = [...monthTx.keys()].sort().slice(-6);
  const lastWeeks = [...weekTx.keys()].sort().slice(-12);
  const latest = lastKeys[lastKeys.length - 1] || "";

  // Collect rows, then write with createMany (fast, avoids per-row round-trips).
  const monthRows: { label: string; monthStart: Date; value: number }[] = [];
  const catRowsOut: { period: string; name: string; value: number }[] = [];
  const subRowsOut: { period: string; parent: string; name: string; value: number }[] = [];
  const txnRowsOut: { period: string; parent: string; sub: string; date: string; comment: string; value: number }[] = [];
  for (const period of lastKeys) {
    const cats = catList(monthTx.get(period));
    const total = round2(cats.reduce((s, c) => s + c.value, 0));
    const [y, m] = period.split("-").map(Number);
    monthRows.push({ label: MONTH_SHORT[m], monthStart: new Date(Date.UTC(y, m - 1, 1)), value: total });
    for (const c of cats) {
      catRowsOut.push({ period, name: c.name, value: c.value });
      for (const s of c.subs) {
        subRowsOut.push({ period, parent: c.name, name: s.sub, value: s.value });
        for (const t of s.txns) txnRowsOut.push({ period, parent: c.name, sub: s.sub, date: t.date, comment: t.comment, value: t.value });
      }
    }
  }

  const weekRowsOut: { label: string; weekEnd: string; value: number }[] = [];
  const wCatRowsOut: { weekEnd: string; name: string; value: number }[] = [];
  const wSubRowsOut: { weekEnd: string; parent: string; name: string; value: number }[] = [];
  const wTxnRowsOut: { weekEnd: string; parent: string; sub: string; date: string; comment: string; value: number }[] = [];
  for (const weekEnd of lastWeeks) {
    const cats = catList(weekTx.get(weekEnd));
    const total = round2(cats.reduce((s, c) => s + c.value, 0));
    weekRowsOut.push({ label: weekLabel.get(weekEnd) || weekEnd, weekEnd, value: total });
    for (const c of cats) {
      wCatRowsOut.push({ weekEnd, name: c.name, value: c.value });
      for (const s of c.subs) {
        wSubRowsOut.push({ weekEnd, parent: c.name, name: s.sub, value: s.value });
        for (const t of s.txns) wTxnRowsOut.push({ weekEnd, parent: c.name, sub: s.sub, date: t.date, comment: t.comment, value: t.value });
      }
    }
  }

  const investRowsOut: { period: string; parent: string; name: string; value: number }[] = [];
  for (const [period, byStatya] of investAgg) {
    for (const [parent, subs] of byStatya) {
      for (const [name, usd] of subs) {
        const value = round2(usd);
        if (value > 0) investRowsOut.push({ period, parent, name, value });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.expenseMonth.deleteMany();
    await tx.expenseCategory.deleteMany();
    await tx.expenseSubcategory.deleteMany();
    await tx.expenseTransaction.deleteMany();
    await tx.otherInvestment.deleteMany();
    await tx.expenseWeek.deleteMany();
    await tx.expenseWeekCategory.deleteMany();
    await tx.expenseWeekSubcategory.deleteMany();
    await tx.expenseWeekTransaction.deleteMany();

    if (monthRows.length) await tx.expenseMonth.createMany({ data: monthRows });
    if (catRowsOut.length) await tx.expenseCategory.createMany({ data: catRowsOut });
    if (subRowsOut.length) await tx.expenseSubcategory.createMany({ data: subRowsOut });
    if (txnRowsOut.length) await tx.expenseTransaction.createMany({ data: txnRowsOut });
    if (weekRowsOut.length) await tx.expenseWeek.createMany({ data: weekRowsOut });
    if (wCatRowsOut.length) await tx.expenseWeekCategory.createMany({ data: wCatRowsOut });
    if (wSubRowsOut.length) await tx.expenseWeekSubcategory.createMany({ data: wSubRowsOut });
    if (wTxnRowsOut.length) await tx.expenseWeekTransaction.createMany({ data: wTxnRowsOut });
    if (investRowsOut.length) await tx.otherInvestment.createMany({ data: investRowsOut });

    await tx.syncState.upsert({
      where: { source: "sheets" },
      update: { lastSyncedAt: new Date(), ok: true },
      create: { source: "sheets", lastSyncedAt: new Date(), ok: true },
    });
  });

  const latestCats = catList(monthTx.get(latest));
  return {
    months: monthRows.map((m) => ({ label: m.label, value: m.value })),
    latestPeriod: latest,
    categories: latestCats.map((c) => ({ name: c.name, value: c.value })),
    rateNote: `single current CBR rate ${rate}`,
    investmentsReclassified: Math.round(investTotal),
  };
}
