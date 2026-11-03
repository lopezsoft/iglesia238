/** The business operates in Colombia (UTC-5, no daylight saving time). */
export const BUSINESS_TIME_ZONE = 'America/Bogota';

// en-CA formats a date as YYYY-MM-DD.
const bogotaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar day in Bogota for an instant. At 23:30 in Bogota the UTC day is already tomorrow. */
export function bogotaDateOf(instant: Date): string {
  return bogotaDate.format(instant);
}

export function bogotaYearOf(instant: Date): number {
  return Number(bogotaDateOf(instant).slice(0, 4));
}

export function bogotaMonthOf(instant: Date): number {
  return Number(bogotaDateOf(instant).slice(5, 7));
}

/** Source of "now". Injected so that rules about today can be tested without waiting for a date. */
export abstract class Clock {
  abstract now(): Date;

  /** Today in Bogota as YYYY-MM-DD. */
  today(): string {
    return bogotaDateOf(this.now());
  }
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
