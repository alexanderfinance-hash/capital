/* Фильтр набора расходов по подстатьям (клиентский, без рантайм-зависимостей).
 * Используется переключателем «Семейный бюджет»: скрыть переводы семье из расходов и
 * статистики. Публичные итоги равны сумме платежей, поэтому убираем нужные платежи и
 * пересчитываем все итоги снизу вверх — набор остаётся согласованным. Входной набор
 * не мутируется (глубокие копии). */
import type { ExpensesBundle, ExpenseCat, SubCat, ExpenseTxn, ExpenseMonth, ExpenseWeek } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

type Tree = Map<string, Map<string, Map<string, ExpenseTxn[]>>>; // период → Статья → Подстатья → платежи

function treeFromRecord(rec: Record<string, Record<string, Record<string, ExpenseTxn[]>>>): Tree {
  const tree: Tree = new Map();
  for (const [key, byP] of Object.entries(rec)) {
    const a = new Map<string, Map<string, ExpenseTxn[]>>();
    for (const [parent, bySub] of Object.entries(byP)) {
      const b = new Map<string, ExpenseTxn[]>();
      for (const [sub, txns] of Object.entries(bySub)) b.set(sub, txns.map((t) => ({ ...t })));
      a.set(parent, b);
    }
    tree.set(key, a);
  }
  return tree;
}

/** Убрать из дерева подстатьи из excludeSet (по нормализованному имени). */
function stripSubs(tree: Tree, excludeSet: Set<string>) {
  for (const [key, byParent] of tree) {
    for (const [parent, bySub] of byParent) {
      for (const sub of [...bySub.keys()]) if (excludeSet.has(norm(sub))) bySub.delete(sub);
      if (!bySub.size) byParent.delete(parent);
    }
    if (!byParent.size) tree.delete(key);
  }
}

function aggregate(tree: Tree): {
  byPeriod: Record<string, ExpenseCat[]>;
  subs: Record<string, Record<string, SubCat[]>>;
  txns: Record<string, Record<string, Record<string, ExpenseTxn[]>>>;
  totals: Map<string, number>;
} {
  const byPeriod: Record<string, ExpenseCat[]> = {};
  const subs: Record<string, Record<string, SubCat[]>> = {};
  const txns: Record<string, Record<string, Record<string, ExpenseTxn[]>>> = {};
  const totals = new Map<string, number>();
  for (const [key, byParent] of tree) {
    const cats: ExpenseCat[] = [];
    const subMap: Record<string, SubCat[]> = {};
    const txP: Record<string, Record<string, ExpenseTxn[]>> = {};
    let periodTotal = 0;
    for (const [parent, bySub] of byParent) {
      const subArr: SubCat[] = [];
      const txSub: Record<string, ExpenseTxn[]> = {};
      let parentTotal = 0;
      for (const [sub, list] of bySub) {
        if (!list.length) continue;
        const v = round2(list.reduce((s, t) => s + t.value, 0));
        subArr.push({ name: sub, value: v });
        txSub[sub] = list;
        parentTotal += v;
      }
      if (!subArr.length) continue;
      subArr.sort((a, b) => b.value - a.value);
      subMap[parent] = subArr;
      txP[parent] = txSub;
      const pt = round2(parentTotal);
      cats.push({ name: parent, value: pt });
      periodTotal += pt;
    }
    cats.sort((a, b) => b.value - a.value);
    byPeriod[key] = cats;
    subs[key] = subMap;
    txns[key] = txP;
    totals.set(key, round2(periodTotal));
  }
  return { byPeriod, subs, txns, totals };
}

/** Есть ли в наборе хотя бы один платёж указанной подстатьи. */
export function bundleHasSub(b: ExpensesBundle, subName: string): boolean {
  const target = norm(subName);
  for (const byP of Object.values(b.expenseTxns)) for (const sub of Object.keys(byP).flatMap((p) => Object.keys(byP[p]))) if (norm(sub) === target) return true;
  return false;
}

/** Набор расходов без указанных подстатей (итоги пересчитаны). */
export function filterExpensesBySub(b: ExpensesBundle, excludeSubs: string[]): ExpensesBundle {
  const excludeSet = new Set(excludeSubs.map(norm).filter(Boolean));
  if (!excludeSet.size) return b;

  const monthTree = treeFromRecord(b.expenseTxns);
  const weekTree = treeFromRecord(b.expenseWeekTxns);
  stripSubs(monthTree, excludeSet);
  stripSubs(weekTree, excludeSet);
  const m = aggregate(monthTree);
  const w = aggregate(weekTree);

  const expenseMonths: ExpenseMonth[] = b.expenseMonths.map((mo) => ({ ...mo, v: round2(m.totals.get(mo.period || "") ?? 0) }));
  const expenseWeeks: ExpenseWeek[] = b.expenseWeeks.map((wk) => ({ ...wk, v: round2(w.totals.get(wk.weekEnd) ?? 0) }));

  const latest = expenseMonths.length ? expenseMonths[expenseMonths.length - 1].period || "" : "";
  const expenseCats = (m.byPeriod[latest] || []).slice();

  return {
    expenseCats,
    expenseMonths,
    expenseWeeks,
    expensesByPeriod: m.byPeriod,
    expenseSubs: m.subs,
    expenseWeeksByPeriod: w.byPeriod,
    expenseWeekSubs: w.subs,
    expenseTxns: m.txns,
    expenseWeekTxns: w.txns,
  };
}
