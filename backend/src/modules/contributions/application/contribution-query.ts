import {
  monthLabel,
  monthRange,
} from '../../../common/accounting/accounting-rules.js';
import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import type {
  ContributionCategory,
  ContributionDisplayStatus,
  PaymentMethod,
} from '../domain/contribution.types.js';
import { daysBetween } from '../../vows/domain/vow-pledge-rules.js';
import type { ContributionFilter } from './contributions.repository.js';

/** A range longer than this is not a screen list: the export is the tool for bigger cuts. */
const MAX_RANGE_DAYS = 731;

/** What the list and the export accept; the period is a month or a date range. */
export interface ContributionQuery {
  year?: number;
  month?: number;
  from?: string;
  to?: string;
  category?: ContributionCategory;
  contributionTypeId?: number;
  paymentMethod?: PaymentMethod;
  status?: ContributionDisplayStatus;
  search?: string;
  congregationId?: number;
}

export interface ResolvedPeriod {
  from: string;
  to: string;
  label: string;
  /** Set when the period is one calendar month. */
  month: { year: number; month: number } | null;
}

function writeDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * The period of a query: an explicit range wins over a month, and with neither it is the month
 * of today. A malformed or inverted range is 400, never an empty list.
 */
export function resolvePeriod(
  query: ContributionQuery,
  today: string,
): ResolvedPeriod {
  if (query.from !== undefined || query.to !== undefined) {
    const { from, to } = query;
    if (!from || !to || !isIsoDate(from) || !isIsoDate(to) || from > to) {
      throw new InvalidInputException(
        'El rango de fechas no es válido: indica desde y hasta, y que desde no sea posterior a hasta.',
        'INVALID_RANGE',
      );
    }
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
      throw new InvalidInputException(
        'El rango de fechas no puede superar dos años.',
        'INVALID_RANGE',
      );
    }
    return {
      from,
      to,
      label: `${writeDate(from)} a ${writeDate(to)}`,
      month: null,
    };
  }
  const year = query.year ?? Number(today.slice(0, 4));
  const month = query.month ?? Number(today.slice(5, 7));
  const range = monthRange({ year, month });
  return {
    ...range,
    label: monthLabel({ year, month }),
    month: { year, month },
  };
}

export function toFilter(
  query: ContributionQuery,
  period: ResolvedPeriod,
): ContributionFilter {
  const search = query.search?.trim();
  return {
    from: period.from,
    to: period.to,
    category: query.category,
    contributionTypeId: query.contributionTypeId,
    paymentMethod: query.paymentMethod,
    status: query.status,
    search: search ? search : undefined,
  };
}
