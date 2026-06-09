/* Pure parsing helpers for the Telegram agency-balances report. No IO / no
 * server-only deps, so they're unit-testable in isolation. See telegram.ts for
 * the sync that uses them. */

/** Header / non-balance lines to ignore (date stamps, totals, captions). */
const HEADER_RE = /(остат|баланс|итог|всего|сумма|дата|на\s+\d|отч[её]т|report|total|выгрузк)/i;
/** A token that looks like a date (09.06 / 09.06.2026 / 9-6) — never a balance. */
const DATE_RE = /\b\d{1,2}[.\-/]\d{1,2}([.\-/]\d{2,4})?\b/;
/** Delimiters that separate an agency name from its amount. */
const DELIM_RE = /[:：=—–\-·•→>|\t]/;
/** Currency markers (the chat reports USD; ₽/руб tolerated). */
const CCY_RE = /(\$|₽|usdt|usd|руб\.?|eur|€)/i;
/** Whitespace incl. non-breaking space, used as thousand separators. */
const WS = "\\s\\u00A0";

/** Parse a money token like "128 400$", "$86,200", "42 750", "1.2к" → number. */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? "").toString().trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/(usdt|usd|руб\.?|rub|eur|€|₽|\$)/g, " ");

  // Multiplier suffix attached to the number: 12к / 1.5k / 3млн.
  let mult = 1;
  const sfx = s.match(new RegExp(`(\\d[\\d${WS}.,']*?)\\s*(млн|m|м|тыс\\.?|k|к)(?=\\s|$)`));
  if (sfx) {
    const u = sfx[2];
    mult = u === "млн" || u === "m" || u === "м" ? 1_000_000 : 1_000;
    s = sfx[1];
  }

  const m = s.match(new RegExp(`-?\\d[\\d${WS}.,']*\\d|\\d`));
  if (!m) return null;
  let t = m[0].replace(new RegExp(`[${WS}']`, "g"), ""); // drop space/apostrophe thousand separators
  const hasDot = t.includes(".");
  const hasComma = t.includes(",");
  if (hasDot && hasComma) {
    // The right-most separator is the decimal point; the other groups thousands.
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (hasComma) {
    const p = t.split(",");
    t = p.length === 2 && p[1].length <= 2 ? p[0] + "." + p[1] : t.replace(/,/g, "");
  } else if (hasDot) {
    const p = t.split(".");
    if (!(p.length === 2 && p[1].length <= 2)) t = t.replace(/\./g, ""); // 12.345 → thousands
  }
  const n = parseFloat(t);
  if (isNaN(n)) return null;
  return Math.round(n * mult * 100) / 100;
}

/** Parse a single line into {name, amount}, or null if it isn't a balance line. */
export function parseLine(line: string): { name: string; amount: number } | null {
  const clean = (line || "").replace(/[*_`]/g, "").trim(); // strip markdown
  if (!clean) return null;

  // Locate the last run of digits — that's the balance; the rest is the name.
  const re = new RegExp(`\\d[\\d${WS}.,']*\\d|\\d`, "g");
  let last: RegExpExecArray | null = null;
  for (let m = re.exec(clean); m; m = re.exec(clean)) last = m;
  if (!last) return null;

  const tail = clean.slice(last.index);
  const head = clean.slice(0, last.index);
  const hasCcy = CCY_RE.test(tail) || CCY_RE.test(clean);

  // Reject date-looking tails unless an explicit currency marker is present.
  if (DATE_RE.test(tail) && !hasCcy) return null;

  const amount = parseAmount(tail);
  if (amount == null) return null;

  let name = head.replace(/[\s:：=.\-—–·•|>→]+$/u, "").trim();
  name = name.replace(/^[\s\d).\-—–·•*]+/u, "").trim(); // drop bullets / "1) "
  if (name.length < 2) return null;
  if (HEADER_RE.test(name)) return null;

  // Require some signal that this really is "name — amount": a delimiter, a
  // currency marker, or a non-trivial amount. Filters out prose lines.
  const hasDelim = DELIM_RE.test(head);
  if (!hasDelim && !hasCcy && amount < 100) return null;

  return { name, amount };
}

/** True when a message looks like the daily balances report. */
export function isReport(text: string): boolean {
  const marker = (process.env.TELEGRAM_REPORT_MARKER || "остат|баланс|агентств").trim();
  if (marker && new RegExp(marker, "i").test(text)) return true;
  // Fallback heuristic: a list with ≥2 parseable balance lines.
  let n = 0;
  for (const l of text.split(/\r?\n/)) if (parseLine(l)) n++;
  return n >= 2;
}

/** Normalize a name for case/whitespace-insensitive matching. */
export const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
