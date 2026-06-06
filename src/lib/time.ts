/* Russian relative-time + date labels for UI (server-side shaping). */

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** "только что" / "N мин назад" / "N ч назад" / "вчера" / "N дн назад". */
export function relativeRu(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} ${plural(min, "минуту", "минуты", "минут")} назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ${plural(h, "час", "часа", "часов")} назад`;
  const days = Math.floor(h / 24);
  if (days === 1) return "вчера";
  return `${days} ${plural(days, "день", "дня", "дней")} назад`;
}

/** Agency-style label + staleDays (used for the «устарело» badge >3 дней). */
export function daysAgoRu(date: Date | string): { label: string; staleDays: number } {
  const d = typeof date === "string" ? new Date(date) : date;
  const staleDays = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  let label: string;
  if (staleDays <= 0) label = "сегодня";
  else label = `${staleDays} ${plural(staleDays, "день", "дня", "дней")} назад`;
  return { label, staleDays };
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** "15 мая" — short day-month label matching the prototype's dividend dates. */
export function dayMonthRu(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

export function yearOf(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getUTCFullYear();
}

const MONTHS_PARSE: Record<string, number> = {
  янв: 0, фев: 1, мар: 2, апр: 3, май: 4, мая: 4, июн: 5, июл: 6, авг: 7, сен: 8, окт: 9, ноя: 10, дек: 11,
};

/** Parse a free-text "10 июн" label into a Date; falls back to today. */
export function parseDayMonthRu(label: string, year = new Date().getUTCFullYear()): Date {
  const m = (label || "").trim().match(/(\d{1,2})\s*([а-яё]+)/i);
  if (!m) return new Date();
  const day = parseInt(m[1], 10);
  const month = MONTHS_PARSE[m[2].toLowerCase().slice(0, 3)] ?? MONTHS_PARSE[m[2].toLowerCase()] ?? new Date().getUTCMonth();
  return new Date(Date.UTC(year, month, day || 1));
}
