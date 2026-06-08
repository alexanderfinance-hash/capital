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
