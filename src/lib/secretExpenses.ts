/* Слияние секретных расходов Алекса в набор агрегатов расходов.
 *
 * Публичный набор (без секретов) считается синком и остаётся неизменным. Здесь мы
 * строим ВТОРОЙ набор — «с секретом»: берём ПЛАТЕЖИ публичного набора, (1) убираем
 * строки-заглушки (та же сумма под другим названием в общей ДДС — иначе двойной счёт),
 * (2) добавляем секретные платежи, (3) ПЕРЕСЧИТЫВАЕМ все итоги (категории/подкатегории/
 * месяцы/недели) из платежей. Публичные итоги и так равны сумме платежей, поэтому
 * пересбор снизу вверх даёт корректный и согласованный набор. Публичные структуры НЕ
 * мутируются (глубокие копии). Набор уходит только владельцу; переключатель на экране
 * выбирает, какой показать. */
import type { ExpensesBundle, ExpenseCat, SubCat, ExpenseTxn, ExpenseMonth, ExpenseWeek } from "./types";

export interface SecretTx {
  date: string; // "YYYY-MM-DD"
  parent: string; // Статья
  sub: string; // Подстатья
  comment: string;
  value: number; // USD, положительный
  /** Комментарий/название строки-заглушки в общей ДДС — её убираем при включении секрета. */
  placeholder?: string;
}

const MONTH_SHORT = ["", "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

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

// Дерево платежей: ключ периода → Статья → Подстатья → платежи.
type Tree = Map<string, Map<string, Map<string, ExpenseTxn[]>>>;

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

function pushTx(tree: Tree, key: string, parent: string, sub: string, tx: ExpenseTxn) {
  const a = tree.get(key) || tree.set(key, new Map()).get(key)!;
  const b = a.get(parent) || a.set(parent, new Map()).get(parent)!;
  (b.get(sub) || b.set(sub, []).get(sub)!).push(tx);
}

/** Заглушка для сопоставления: по (нормализованному названию, сумме). */
interface Stub { ref: string; value: number }

/** Убрать из дерева платежи-заглушки: совпадает нормализованный комментарий и сумма
 *  (с небольшим допуском). Пустые подстатьи/статьи/периоды подчищаем. */
function stripStubs(tree: Tree, stubs: Stub[]) {
  if (!stubs.length) return;
  const matches = (tx: ExpenseTxn) => {
    const c = norm(tx.comment);
    return stubs.some((s) => s.ref === c && Math.abs(tx.value - s.value) <= Math.max(0.02, s.value * 0.005));
  };
  for (const [key, byParent] of tree) {
    for (const [parent, bySub] of byParent) {
      for (const [sub, txns] of bySub) {
        const kept = txns.filter((t) => !matches(t));
        if (kept.length) bySub.set(sub, kept);
        else bySub.delete(sub);
      }
      if (!bySub.size) byParent.delete(parent);
    }
    if (!byParent.size) tree.delete(key);
  }
}

/** Пересчитать агрегаты (категории/подкатегории/платежи/итоги периода) из дерева. */
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

/** pub (без секретов) + секретные платежи − заглушки → набор «с секретом». */
export function mergeSecret(pub: ExpensesBundle, secret: SecretTx[]): ExpensesBundle {
  if (!secret.length) return pub;

  // 1) Платежи публичного набора (копии).
  const monthTree = treeFromRecord(pub.expenseTxns);
  const weekTree = treeFromRecord(pub.expenseWeekTxns);

  // 2) Убрать заглушки (по строкам секретной таблицы, где указана заглушка).
  const stubs: Stub[] = [];
  for (const t of secret) {
    if (t.placeholder && t.placeholder.trim() && t.value > 0) stubs.push({ ref: norm(t.placeholder), value: round2(t.value) });
  }
  stripStubs(monthTree, stubs);
  stripStubs(weekTree, stubs);

  // 3) Влить секретные платежи.
  const weekLabel = new Map<string, string>();
  for (const t of secret) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !(t.value > 0)) continue;
    const tx: ExpenseTxn = { date: t.date, comment: t.comment, value: round2(t.value) };
    const parent = t.parent || "Прочее";
    const sub = t.sub || parent;
    pushTx(monthTree, t.date.slice(0, 7), parent, sub, tx);
    const wk = weekOf(t.date);
    weekLabel.set(wk.weekEnd, wk.label);
    pushTx(weekTree, wk.weekEnd, parent, sub, tx);
  }

  // 4) Пересчитать агрегаты из деревьев.
  const m = aggregate(monthTree);
  const w = aggregate(weekTree);

  // Месяцы: сохраняем scaffolding публичных месяцев (label/income), итог v берём из
  // пересчёта (0, если платежи периода исчезли); добавляем новые месяцы из секрета.
  const monthByPeriod = new Map<string, ExpenseMonth>();
  for (const mo of pub.expenseMonths) {
    const period = mo.period || "";
    monthByPeriod.set(period, { ...mo, v: round2(m.totals.get(period) ?? 0) });
  }
  for (const [period, total] of m.totals) {
    if (monthByPeriod.has(period)) continue;
    const mon = Number(period.split("-")[1]);
    monthByPeriod.set(period, { m: MONTH_SHORT[mon] || period, v: round2(total), income: 0, period });
  }
  const expenseMonths = [...monthByPeriod.values()].sort((a, b) => (a.period || "").localeCompare(b.period || ""));

  // Недели: аналогично.
  const weekByEnd = new Map<string, ExpenseWeek>();
  for (const wk of pub.expenseWeeks) weekByEnd.set(wk.weekEnd, { ...wk, v: round2(w.totals.get(wk.weekEnd) ?? 0) });
  for (const [weekEnd, total] of w.totals) {
    if (weekByEnd.has(weekEnd)) continue;
    weekByEnd.set(weekEnd, { w: weekLabel.get(weekEnd) || weekEnd, v: round2(total), weekEnd, income: 0 });
  }
  const expenseWeeks = [...weekByEnd.values()].sort((a, b) => a.weekEnd.localeCompare(b.weekEnd));

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
