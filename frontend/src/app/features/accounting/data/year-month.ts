export interface YearMonth {
  readonly year: number;
  readonly month: number;
}

/** '2026-11-02' → { year: 2026, month: 11 }. */
export function yearMonthOf(date: string): YearMonth {
  const [year, month] = date.split('-').map(Number);
  return { year, month };
}

/** Key of a month in selectors: '2026-11'. */
export function monthKey({ year, month }: YearMonth): string {
  return `${year}-${month}`;
}

export function parseMonthKey(key: string): YearMonth | null {
  const match = /^(\d{4})-(\d{1,2})$/.exec(key);
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}
