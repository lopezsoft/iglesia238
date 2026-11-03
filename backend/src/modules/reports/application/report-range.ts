import { monthRange } from '../../../common/accounting/accounting-rules.js';
import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import type { DateSpan } from './ports/financial-data.reader.js';

const DAY_MS = 86_400_000;

/** Rejects ranges the report cannot answer: malformed, reversed, or spanning two years. */
export function assertReportRange(span: DateSpan): void {
  if (!isIsoDate(span.from) || !isIsoDate(span.to)) {
    throw new InvalidInputException(
      'Indica fechas válidas en «Desde» y «Hasta».',
      'INVALID_RANGE',
    );
  }
  if (span.from > span.to) {
    throw new InvalidInputException(
      'La fecha «Desde» no puede ser posterior a la fecha «Hasta».',
      'INVALID_RANGE',
    );
  }
  if (span.from.slice(0, 4) !== span.to.slice(0, 4)) {
    throw new InvalidInputException(
      'El reporte cubre un solo año contable: elige fechas del mismo año.',
      'RANGE_CROSSES_YEAR',
    );
  }
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

/** The same number of days right before the range. */
export function previousSpan(span: DateSpan): DateSpan {
  const to = addDays(span.from, -1);
  return { from: addDays(to, -daysBetween(span.from, span.to)), to };
}

export interface MonthSpan extends DateSpan {
  readonly year: number;
  readonly month: number;
}

/** The months touched by a range of one year, each one clipped to the range. */
export function monthSpans(span: DateSpan): MonthSpan[] {
  const year = Number(span.from.slice(0, 4));
  const first = Number(span.from.slice(5, 7));
  const last = Number(span.to.slice(5, 7));
  const months: MonthSpan[] = [];
  for (let month = first; month <= last; month++) {
    const full = monthRange({ year, month });
    months.push({
      year,
      month,
      from: full.from < span.from ? span.from : full.from,
      to: full.to > span.to ? span.to : full.to,
    });
  }
  return months;
}
