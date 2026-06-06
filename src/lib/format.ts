/* Number formatting — mirrors prototype's fmt / fmtK (IBM Plex Mono tabular). */

export const fmt = (n: number): string =>
  "$" + Math.round(n).toLocaleString("en-US");

export const fmtK = (n: number): string =>
  "$" + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "к";
