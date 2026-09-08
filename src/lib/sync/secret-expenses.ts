/* Синк секретных личных расходов Алекса из ОТДЕЛЬНОЙ Google-таблицы
 * (GOOGLE_SHEETS_SECRET_ID). Лист устроен как «ДДС»: колонки Дата / Сумма / Статья /
 * Подстатья / (Комментарий). Каждая строка с суммой и статьёй считается расходом
 * (лист посвящён расходам, знак суммы не важен). ₽→$ по текущему курсу ЦБ.
 *
 * Если GOOGLE_SHEETS_SECRET_ID не задан — синк НИЧЕГО не делает (безопасно на
 * незаданной интеграции). Падает ДО записи при ошибке чтения (PRD §7). */
import "server-only";
import { prisma } from "../prisma";
import { readValuesFrom, listSheetTitles } from "../sheets";
import { getCurrentUsdRub } from "../fx";

const round2 = (n: number) => Math.round(n * 100) / 100;
function parseNum(s: string | undefined): number {
  if (s == null) return 0;
  const t = String(s).replace(/[^\d.,\-]/g, "").replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
}
function periodOfDate(date: string): string | null {
  const m = (date || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

interface Cols { headerRow: number; date: number; sum: number; comment: number; statya: number; podstatya: number; }
function findCols(rows: string[][]): Cols | null {
  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const cells = (rows[r] || []).map((c) => (c || "").trim().toLowerCase());
    const date = cells.findIndex((c) => c === "дата");
    const sum = cells.findIndex((c) => c === "сумма");
    const statya = cells.findIndex((c) => c === "статья");
    if (date >= 0 && sum >= 0 && statya >= 0) {
      const podstatya = cells.findIndex((c) => c === "подстатья");
      let comment = cells.findIndex((c) => c.includes("коммент"));
      if (comment < 0) comment = 7;
      return { headerRow: r, date, sum, comment, statya, podstatya: podstatya >= 0 ? podstatya : statya };
    }
  }
  return null;
}

export interface SecretSyncResult { ok: boolean; count: number; note?: string }

export async function syncSecretExpenses(): Promise<SecretSyncResult> {
  const id = (process.env.GOOGLE_SHEETS_SECRET_ID || "").trim();
  if (!id) return { ok: true, count: 0, note: "GOOGLE_SHEETS_SECRET_ID не задан — секретные расходы отключены" };

  const override = process.env.GOOGLE_SHEETS_SECRET_TAB;
  const titles = override ? [override] : await listSheetTitles(id);
  let found: (Cols & { rows: string[][] }) | null = null;
  for (const tab of titles) {
    const rows = await readValuesFrom(id, tab, "A1:N5000");
    const cols = findCols(rows);
    if (cols) { found = { ...cols, rows }; break; }
  }
  // Падаем ДО записи, чтобы не затереть прошлые значения при сбое чтения (PRD §7).
  if (!found) throw new Error("Секретный лист не найден (нет колонок Дата/Сумма/Статья)");

  const rate = (await getCurrentUsdRub()) || 95;
  const rowsOut: { date: string; parent: string; sub: string; comment: string; value: number }[] = [];
  for (let r = found.headerRow + 1; r < found.rows.length; r++) {
    const row = found.rows[r] || [];
    const statya = (row[found.statya] || "").trim();
    if (!statya) continue;
    const iso = periodOfDate(row[found.date] || "");
    if (!iso) continue;
    const rub = Math.abs(parseNum(row[found.sum]));
    if (!rub) continue;
    const usd = round2(rub / rate);
    if (usd <= 0) continue;
    const sub = (row[found.podstatya] || "").trim() || statya;
    rowsOut.push({ date: iso, parent: statya, sub, comment: (row[found.comment] || "").trim(), value: usd });
  }

  await prisma.$transaction(async (tx) => {
    await tx.secretExpenseTxn.deleteMany();
    if (rowsOut.length) await tx.secretExpenseTxn.createMany({ data: rowsOut });
    await tx.syncState.upsert({
      where: { source: "secret" },
      update: { lastSyncedAt: new Date(), ok: true },
      create: { source: "secret", lastSyncedAt: new Date(), ok: true },
    });
  });
  return { ok: true, count: rowsOut.length };
}
