// Pure accounting rules shared by the accounting modules. They take plain values (no state), so they
// are easy to test. Money is handled in whole cents: Decimal(14,2) values never go through floats.

export const VoucherTypes = {
  /** Contribution receipt. */
  receipt: 'REC',
  /** Cash income not coming from a single contribution (also the consolidation of contributions). */
  cashIn: 'CI',
  /** Cash expense. */
  cashOut: 'CE',
  /** Tithe settlement document. */
  titheSettlement: 'LD',
} as const;
export type VoucherType = (typeof VoucherTypes)[keyof typeof VoucherTypes];

export const VOUCHER_TYPE_LIST: readonly VoucherType[] =
  Object.values(VoucherTypes);

/** Largest amount a Decimal(14,2) column holds. */
export const MAX_MONEY_AMOUNT = 999_999_999_999.99;

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** '2026-11-02' -> { year: 2026, month: 11 }. */
export function yearMonthOf(date: string): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

/** First and last day ('YYYY-MM-DD') of a month. */
export function monthRange({ year, month }: YearMonth): {
  from: string;
  to: string;
} {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** "Noviembre 2026". */
export function monthLabel({ year, month }: YearMonth): string {
  const name = MONTH_NAMES[month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 12
    ? { year: year + 1, month: 1 }
    : { year, month: month + 1 };
}

export function previousMonth({ year, month }: YearMonth): YearMonth {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

/** Negative when a is before b. */
export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a.year - b.year || a.month - b.month;
}

export function sameYearMonth(a: YearMonth, b: YearMonth): boolean {
  return compareYearMonth(a, b) === 0;
}

/** '2026-11-02' -> '02/11/2026' (stored descriptions are text, not formatted by the UI). */
export function displayDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

// --- Money in cents ------------------------------------------------------------------------------

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Rounds to two decimals without accumulating float error. */
export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

/** Signed effect of a cash line on a fund: income adds, expense subtracts. */
export function signedCents(
  direction: 'IN' | 'OUT',
  amountCents: number,
): number {
  return direction === 'IN' ? amountCents : -amountCents;
}

// --- Text ----------------------------------------------------------------------------------------

/** Case- and accent-insensitive form of a text, to compare names the way people read them. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function sameText(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}
