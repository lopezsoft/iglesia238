/** Rates travel as fractions (0.21); people read and type percentages (21 %). */

/** 0.21 → "21 %", 0.1225 → "12,25 %". */
export function formatRate(rate: number): string {
  return `${(rate * 100).toLocaleString('es-CO', { maximumFractionDigits: 2 })} %`;
}

/** 21 → 0.21, keeping the four decimals the API stores (12.25 → 0.1225). */
export function rateFromPercent(percent: number): number {
  return Math.round(percent * 100) / 10_000;
}

/** 0.21 → 21 (for the form field). */
export function percentFromRate(rate: number): number {
  return Math.round(rate * 10_000) / 100;
}
