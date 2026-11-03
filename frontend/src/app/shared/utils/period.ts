/** Accounting calendar helpers shared by the screens that work with months ('YYYY-MM-DD' dates). */

export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

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

/** '2026-11-02' → { year: 2026, month: 11 }. */
export function yearMonthOf(date: string): YearMonth {
  const [year, month] = date.split('-').map(Number);
  return { year, month };
}

/** First and last day ('YYYY-MM-DD') of a month. */
export function monthRange({ year, month }: YearMonth): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` };
}

/** "Noviembre 2026". */
export function monthLabel({ year, month }: YearMonth): string {
  const name = MONTH_NAMES[month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function previousMonth({ year, month }: YearMonth): YearMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** '2026-11-02' → '02/11/2026'. */
export function displayDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
