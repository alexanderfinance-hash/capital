/* Number formatting — mirrors prototype's fmt / fmtK (IBM Plex Mono tabular). */

export const fmt = (n: number): string =>
  "$" + Math.round(n).toLocaleString("en-US");

export const fmtK = (n: number): string =>
  "$" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "к";

/** Token quantity: trims trailing zeros, up to 6 significant decimals. */
export const fmtAmount = (n: number): string => {
  if (!isFinite(n)) return "0";
  const decimals = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
};

/** Russian plural picker: pluralRu(2, "номер", "номера", "номеров") → "номера". */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** "5 номеров" — quantity label for TON anonymous numbers. */
export const fmtTonNumbers = (n: number): string =>
  `${fmtAmount(n)} ${pluralRu(Math.round(n), "номер", "номера", "номеров")}`;
