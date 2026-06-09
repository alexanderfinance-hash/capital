/* Pure parsing helpers for the Telegram agency-balances report. No IO / no
 * server-only deps, so they're unit-testable in isolation. See telegram.ts for
 * the sync that uses them.
 *
 * Two message shapes are supported:
 *  1. Spend-note format (real company chat): each balance line ends with a
 *     "(спенд - …)" note, e.g.
 *       Unico - Hill Agency - $2212.33 (спенд - 13$)
 *       #735 FB UniCO | ROICraft 7% - $534.32 (спенд - 0$)
 *     The balance is the number BEFORE the spend note; a trailing
 *     "Нужно пополнить …" block (+3000 / не требуется) has no spend note and is
 *     ignored. When ANY line carries a spend note the whole message is parsed in
 *     this mode (only spend-note lines count).
 *  2. Simple format: "name — amount" per line (no spend note). */

/** Header / non-balance lines to ignore (date stamps, totals, captions). */
const HEADER_RE = /(остатк|итог|всего|сумма|дата|отч[её]т|report|total|выгрузк|пополн|нужно)/i;
/** A token that looks like a date (09.06 / 09.06.2026 / 9-6) — never a balance. */
const DATE_RE = /\b\d{1,2}[.\-/]\d{1,2}([.\-/]\d{2,4})?\b/;
/** Delimiters that separate an agency name from its amount. */
const DELIM_RE = /[:：=—–\-·•→>|\t]/;
/** Currency markers (the chat reports USD; ₽/руб tolerated). */
const CCY_RE = /(\$|₽|usdt|usd|руб\.?|eur|€)/i;
/** A "(спенд …)" / "(spend …)" note that marks a balance line and trails it. */
const SPEND_RE = /\(\s*(спенд|spend)/i;
/** Whitespace incl. non-breaking space, used as thousand separators. */
const WS = "\\s\\u00A0";

const numbersRe = () => new RegExp(`\\d[\\d${WS}.,']*\\d|\\d`, "g");

/** Index of the last digit-run in a string, or -1. */
function lastNumberIndex(s: string): number {
  const re = numbersRe();
  let last = -1;
  for (let m = re.exec(s); m; m = re.exec(s)) last = m.index;
  return last;
}

/** Parse a money token like "128 400$", "$86,200", "2325,08", "1.2к" → number. */
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

/** Trim trailing separators/currency and leading bullets from a parsed name. */
function cleanName(raw: string): string {
  let name = raw.replace(/[\s:：=.\-—–·•|>→$₽]+$/u, "").trim();
  name = name.replace(/^[\s•·●*▪►–—-]+/u, "").trim();
  return name;
}

/** Spend-note line: balance = last number BEFORE the "(спенд …)" note. */
export function parseSpendLine(line: string): { name: string; amount: number } | null {
  const clean = (line || "").replace(/[*_`]/g, "").trim();
  if (!clean) return null;
  const m = clean.match(SPEND_RE);
  if (!m) return null; // only spend-note lines are balances in this mode
  const pre = clean.slice(0, m.index).trim();
  if (!pre) return null;
  const idx = lastNumberIndex(pre);
  if (idx < 0) return null;
  const amount = parseAmount(pre.slice(idx));
  if (amount == null) return null;
  const name = cleanName(pre.slice(0, idx));
  if (name.length < 2 || HEADER_RE.test(name)) return null;
  return { name, amount };
}

/** Simple "name — amount" line (no spend note). */
export function parseLine(line: string): { name: string; amount: number } | null {
  const clean = (line || "").replace(/[*_`]/g, "").trim(); // strip markdown
  if (!clean) return null;

  const idx = lastNumberIndex(clean);
  if (idx < 0) return null;

  const tail = clean.slice(idx);
  const head = clean.slice(0, idx);
  const hasCcy = CCY_RE.test(tail) || CCY_RE.test(clean);

  // Reject date-looking tails unless an explicit currency marker is present.
  if (DATE_RE.test(tail) && !hasCcy) return null;

  const amount = parseAmount(tail);
  if (amount == null) return null;

  const name = cleanName(head);
  if (name.length < 2) return null;
  if (HEADER_RE.test(name)) return null;

  // Require some signal that this really is "name — amount": a delimiter, a
  // currency marker, or a non-trivial amount. Filters out prose lines.
  const hasDelim = DELIM_RE.test(head);
  if (!hasDelim && !hasCcy && amount < 100) return null;

  return { name, amount };
}

/** Normalize a name for case/whitespace-insensitive matching. */
export const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Parse a whole report message into {name, amount} entries (deduped, first
 *  occurrence wins). Picks spend-note mode when any line carries a spend note. */
export function parseReport(text: string): { name: string; amount: number }[] {
  const lines = (text || "").split(/\r?\n/);
  const spendMode = lines.some((l) => SPEND_RE.test(l));
  const out: { name: string; amount: number }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const e = spendMode ? parseSpendLine(line) : parseLine(line);
    if (!e) continue;
    const key = normName(e.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** True when a message looks like the daily balances report. */
export function isReport(text: string): boolean {
  const marker = (process.env.TELEGRAM_REPORT_MARKER || "остат|баланс|агентств|спенд").trim();
  if (marker && new RegExp(marker, "i").test(text)) return true;
  return parseReport(text).length >= 2;
}
