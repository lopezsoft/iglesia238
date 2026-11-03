import type {
  DashboardPeriod,
  DateRange,
  PeriodWindow,
} from './dashboard.types.js';

const DAY_MS = 86_400_000;
/** Bogota is UTC-5 all year: midnight there is 05:00 UTC. */
const BOGOTA_OFFSET_HOURS = 5;
const SERIES_DAYS = 7;

const PERIOD_LABELS: Readonly<Record<DashboardPeriod, string>> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  '7d': '7 días',
  month: 'Mes',
};

function toUtcDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, amount: number): string {
  return toDay(new Date(toUtcDate(day).getTime() + amount * DAY_MS));
}

function startOfMonth(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Every day of a range, oldest first. */
export function daysOf(range: DateRange): string[] {
  const days: string[] = [];
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** The instants that delimit a range of Bogota days: `gte` the first midnight, `lt` the one after the last day. */
export function rangeBounds(range: DateRange): { gte: Date; lt: Date } {
  const midnight = (day: string) =>
    new Date(toUtcDate(day).getTime() + BOGOTA_OFFSET_HOURS * 3_600_000);
  return { gte: midnight(range.from), lt: midnight(addDays(range.to, 1)) };
}

/** The days elapsed so far this month, projected on the previous month (clamped to its length). */
function previousMonthSpan(today: string): DateRange {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const dayOfMonth = Number(today.slice(8, 10));
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const lastDay = daysInMonth(previousYear, previousMonth);
  const pad = (value: number) => String(value).padStart(2, '0');
  const prefix = `${previousYear}-${pad(previousMonth)}`;
  return {
    from: `${prefix}-01`,
    to: `${prefix}-${pad(Math.min(dayOfMonth, lastDay))}`,
  };
}

/**
 * Translates the period chosen on the page into dates. Today, yesterday and 7 days compare with the
 * period of the same length right before; "month" compares the days elapsed so far with the same days
 * of the previous month.
 */
export function buildPeriodWindow(
  period: DashboardPeriod,
  today: string,
): PeriodWindow {
  const base = { period, label: PERIOD_LABELS[period], today };
  const lastSeriesDays = (last: string) =>
    daysOf({ from: addDays(last, -(SERIES_DAYS - 1)), to: last });

  switch (period) {
    case 'today':
      return {
        ...base,
        current: { from: today, to: today },
        previous: { from: addDays(today, -1), to: addDays(today, -1) },
        previousLabel: 'ayer',
        seriesDays: lastSeriesDays(today),
      };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return {
        ...base,
        current: { from: yesterday, to: yesterday },
        previous: { from: addDays(yesterday, -1), to: addDays(yesterday, -1) },
        previousLabel: 'antier',
        seriesDays: lastSeriesDays(yesterday),
      };
    }
    case '7d': {
      const current = { from: addDays(today, -6), to: today };
      return {
        ...base,
        current,
        previous: { from: addDays(today, -13), to: addDays(today, -7) },
        previousLabel: 'los 7 días anteriores',
        seriesDays: daysOf(current),
      };
    }
    case 'month': {
      const current = { from: startOfMonth(today), to: today };
      return {
        ...base,
        current,
        previous: previousMonthSpan(today),
        previousLabel: 'el mes anterior',
        seriesDays: daysOf(current),
      };
    }
  }
}

const SHORT_MONTHS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

export interface MonthKey {
  readonly year: number;
  readonly month: number;
  /** YYYY-MM */
  readonly key: string;
  /** "Nov" */
  readonly label: string;
}

/** The last `count` months ending in the month of `today`, oldest first. */
export function lastMonths(today: string, count: number): MonthKey[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const months: MonthKey[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const index = year * 12 + (month - 1) - offset;
    const y = Math.floor(index / 12);
    const m = (index % 12) + 1;
    months.push({
      year: y,
      month: m,
      key: `${y}-${String(m).padStart(2, '0')}`,
      label: SHORT_MONTHS[m - 1],
    });
  }
  return months;
}

/** First day of the oldest month and the day after the last one, as a range of days. */
export function monthsRange(
  months: readonly MonthKey[],
  today: string,
): DateRange {
  return { from: `${months[0].key}-01`, to: today };
}
