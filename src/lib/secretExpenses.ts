/* Слияние секретных расходов Алекса в набор агрегатов расходов.
 *
 * Публичный набор (без секретов) считается синком и остаётся неизменным. Здесь мы
 * строим ВТОРОЙ набор — «с секретом»: те же структуры, но с добавленными секретными
 * платежами (по месяцам/неделям/категориям/подкатегориям/платежам). Дашборд отдаёт
 * этот набор только владельцу; переключатель на экране выбирает, какой набор показать.
 * Публичные структуры НЕ мутируются (делаем глубокие копии). */
import type { ExpensesBundle, ExpenseCat, SubCat, ExpenseTxn, ExpenseMonth, ExpenseWeek } from "./types";

export interface SecretTx {
  date: string; // "YYYY-MM-DD"
  parent: string; // Статья
  sub: string; // Подстатья
  comment: string;
  value: number; // USD, положительный
}

const MONTH_SHORT = ["", "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Неделя (Пн–Вс), содержащая дату — как в синке расходов. */
function weekOf(iso: string): { weekEnd: string; label: string } {
  const d = new Date(iso + "T00:00:00Z");
  const fromMonday = (d.getUTCDay() + 6) % 7;
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - fromMonday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const p = (n: number) => String(n).padStart(2, "0");
  const weekEnd = `${end.getUTCFullYear()}-${p(end.getUTCMonth() + 1)}-${p(end.getUTCDate())}`;
  const label = `${p(start.getUTCDate())}.${p(start.getUTCMonth() + 1)}–${p(end.getUTCDate())}.${p(end.getUTCMonth() + 1)}`;
  return { weekEnd, label };
}

type Tree = Map<string, Map<string, Map<string, ExpenseTxn[]>>>; // key → Статья → Подстатья → платежи
function push(tree: Tree, key: string, parent: string, sub: string, tx: ExpenseTxn) {
  const a = tree.get(key) || tree.set(key, new Map()).get(key)!;
  const b = a.get(parent) || a.set(parent, new Map()).get(parent)!;
  (b.get(sub) || b.set(sub, []).get(sub)!).push(tx);
}
function sumTree(byParent: Map<string, Map<string, ExpenseTxn[]>> | undefined): number {
  let s = 0;
  if (!byParent) return 0;
  for (const bySub of byParent.values()) for (const txns of bySub.values()) for (const t of txns) s += t.value;
  return round2(s);
}

const cloneCatRec = (r: Record<string, ExpenseCat[]>): Record<string, ExpenseCat[]> =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.map((c) => ({ ...c }))]));
const cloneSubRec = (r: Record<string, Record<string, SubCat[]>>): Record<string, Record<string, SubCat[]>> =>
  Object.fromEntries(Object.entries(r).map(([k, byP]) => [k, Object.fromEntries(Object.entries(byP).map(([p, subs]) => [p, subs.map((s) => ({ ...s }))]))]));
const cloneTxnTree = (t: Record<string, Record<string, Record<string, ExpenseTxn[]>>>) =>
  Object.fromEntries(Object.entries(t).map(([k, byP]) => [k, Object.fromEntries(Object.entries(byP).map(([p, bySub]) => [p, Object.fromEntries(Object.entries(bySub).map(([s, txns]) => [s, txns.map((x) => ({ ...x }))]))]))]));

/** Влить дерево секретных платежей в byPeriod (категории) + subs + txns одного разреза. */
function mergeTree(tree: Tree, byPeriod: Record<string, ExpenseCat[]>, subs: Record<string, Record<string, SubCat[]>>, txnTree: Record<string, Record<string, Record<string, ExpenseTxn[]>>>) {
  for (const [key, byParent] of tree) {
    const catArr = (byPeriod[key] ||= []);
    const catIdx = new Map(catArr.map((c, i) => [c.name, i]));
    const subKey = (subs[key] ||= {});
    const txKey = (txnTree[key] ||= {});
    for (const [parent, bySub] of byParent) {
      const subArr = (subKey[parent] ||= []);
      const subIdx = new Map(subArr.map((s, i) => [s.name, i]));
      const txParent = (txKey[parent] ||= {});
      let parentAdd = 0;
      for (const [sub, txns] of bySub) {
        const subTotal = round2(txns.reduce((s, t) => s + t.value, 0));
        parentAdd += subTotal;
        (txParent[sub] ||= []).push(...txns);
        const si = subIdx.get(sub);
        if (si != null) subArr[si].value = round2(subArr[si].value + subTotal);
        else { subArr.push({ name: sub, value: subTotal }); subIdx.set(sub, subArr.length - 1); }
      }
      parentAdd = round2(parentAdd);
      const ci = catIdx.get(parent);
      if (ci != null) catArr[ci].value = round2(catArr[ci].value + parentAdd);
      else { catArr.push({ name: parent, value: parentAdd }); catIdx.set(parent, catArr.length - 1); }
    }
    catArr.sort((a, b) => b.value - a.value);
    for (const p of Object.keys(subKey)) subKey[p].sort((a, b) => b.value - a.value);
  }
}

/** pub (без секретов) + секретные платежи → набор «с секретом». */
export function mergeSecret(pub: ExpensesBundle, secret: SecretTx[]): ExpensesBundle {
  if (!secret.length) return pub;
  const monthTree: Tree = new Map();
  const weekTree: Tree = new Map();
  const weekLabel = new Map<string, string>();
  for (const t of secret) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !(t.value > 0)) continue;
    const tx: ExpenseTxn = { date: t.date, comment: t.comment, value: round2(t.value) };
    const parent = t.parent || "Прочее";
    const sub = t.sub || parent;
    push(monthTree, t.date.slice(0, 7), parent, sub, tx);
    const wk = weekOf(t.date);
    weekLabel.set(wk.weekEnd, wk.label);
    push(weekTree, wk.weekEnd, parent, sub, tx);
  }

  const out: ExpensesBundle = {
    expenseCats: pub.expenseCats.map((c) => ({ ...c })),
    expenseMonths: pub.expenseMonths.map((m) => ({ ...m })),
    expenseWeeks: pub.expenseWeeks.map((w) => ({ ...w })),
    expensesByPeriod: cloneCatRec(pub.expensesByPeriod),
    expenseSubs: cloneSubRec(pub.expenseSubs),
    expenseWeeksByPeriod: cloneCatRec(pub.expenseWeeksByPeriod),
    expenseWeekSubs: cloneSubRec(pub.expenseWeekSubs),
    expenseTxns: cloneTxnTree(pub.expenseTxns),
    expenseWeekTxns: cloneTxnTree(pub.expenseWeekTxns),
  };

  mergeTree(monthTree, out.expensesByPeriod, out.expenseSubs, out.expenseTxns);
  mergeTree(weekTree, out.expenseWeeksByPeriod, out.expenseWeekSubs, out.expenseWeekTxns);

  // Месячные итоги: добавляем секрет к существующему месяцу или заводим месяц.
  const monthByPeriod = new Map<string, ExpenseMonth>(out.expenseMonths.map((m) => [m.period || "", m]));
  for (const period of monthTree.keys()) {
    const add = sumTree(monthTree.get(period));
    const ex = monthByPeriod.get(period);
    if (ex) ex.v = round2(ex.v + add);
    else {
      const [y, mo] = period.split("-").map(Number);
      void y;
      const nm: ExpenseMonth = { m: MONTH_SHORT[mo] || period, v: round2(add), income: 0, period };
      out.expenseMonths.push(nm);
      monthByPeriod.set(period, nm);
    }
  }
  out.expenseMonths.sort((a, b) => (a.period || "").localeCompare(b.period || ""));

  const weekByEnd = new Map<string, ExpenseWeek>(out.expenseWeeks.map((w) => [w.weekEnd, w]));
  for (const weekEnd of weekTree.keys()) {
    const add = sumTree(weekTree.get(weekEnd));
    const ex = weekByEnd.get(weekEnd);
    if (ex) ex.v = round2(ex.v + add);
    else {
      const nw: ExpenseWeek = { w: weekLabel.get(weekEnd) || weekEnd, v: round2(add), weekEnd, income: 0 };
      out.expenseWeeks.push(nw);
      weekByEnd.set(weekEnd, nw);
    }
  }
  out.expenseWeeks.sort((a, b) => a.weekEnd.localeCompare(b.weekEnd));

  const latest = out.expenseMonths.length ? out.expenseMonths[out.expenseMonths.length - 1].period || "" : "";
  out.expenseCats = (out.expensesByPeriod[latest] || []).slice().sort((a, b) => b.value - a.value);
  return out;
}
