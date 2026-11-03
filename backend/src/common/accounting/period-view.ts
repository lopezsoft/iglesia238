import { toIsoDateTimeOrNull } from '../mappers/value-mappers.js';
import { monthLabel, monthRange } from './accounting-rules.js';

export type PeriodStatusValue = 'OPEN' | 'CLOSED';

/** An accounting period of a congregation as the database keeps it. */
export interface PeriodRecord {
  readonly id: number;
  readonly year: number;
  readonly month: number;
  readonly status: PeriodStatusValue;
  readonly closedAt: Date | null;
}

/** What the screens receive for a period. */
export interface PeriodView {
  readonly id: number;
  readonly year: number;
  readonly month: number;
  readonly status: PeriodStatusValue;
  /** "Noviembre 2026". */
  readonly label: string;
  readonly closedAt: string | null;
  /** First and last day ('YYYY-MM-DD'). */
  readonly from: string;
  readonly to: string;
}

export function toPeriodView(period: PeriodRecord): PeriodView {
  const { from, to } = monthRange(period);
  return {
    id: period.id,
    year: period.year,
    month: period.month,
    status: period.status,
    label: monthLabel(period),
    closedAt: toIsoDateTimeOrNull(period.closedAt),
    from,
    to,
  };
}
