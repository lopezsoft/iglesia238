import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import { AgeRange, MemberStatus } from './member.models.js';

export const ADULT_AGE = 18;

export interface AgeBounds {
  readonly min: number;
  readonly max: number;
}

export const AGE_RANGE_BOUNDS: Readonly<Record<AgeRange, AgeBounds>> = {
  ALL: { min: 0, max: Number.POSITIVE_INFINITY },
  CHILDREN: { min: 0, max: 11 },
  TEENAGERS: { min: 12, max: 17 },
  YOUNG_ADULTS: { min: 18, max: 29 },
  ADULTS: { min: 30, max: 59 },
  SENIORS: { min: 60, max: Number.POSITIVE_INFINITY },
};

/** Age in whole years on `today` (both YYYY-MM-DD), or null without a birth date. */
export function ageOn(birthDate: string | null, today: string): number | null {
  if (!birthDate) {
    return null;
  }
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** `date` minus whole years; 29 February falls back to 28 February in a common year. */
export function minusYears(date: string, years: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = year - years;
  const lastDay = new Date(Date.UTC(target, month, 0)).getUTCDate();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(target).padStart(4, '0')}-${pad(month)}-${pad(Math.min(day, lastDay))}`;
}

function plusDays(date: string, days: number): string {
  const moment = new Date(`${date}T00:00:00.000Z`);
  moment.setUTCDate(moment.getUTCDate() + days);
  return moment.toISOString().slice(0, 10);
}

/**
 * Birth dates whose age on `today` is between `min` and `max` (inclusive). A null bound means
 * "no limit on that side".
 */
export function birthBoundsForAges(
  bounds: AgeBounds,
  today: string,
): { bornOnOrAfter: string | null; bornOnOrBefore: string | null } {
  return {
    bornOnOrBefore: bounds.min > 0 ? minusYears(today, bounds.min) : null,
    bornOnOrAfter: Number.isFinite(bounds.max)
      ? plusDays(minusYears(today, bounds.max + 1), 1)
      : null,
  };
}

export function isMinorOn(birthDate: string | null, today: string): boolean {
  const age = ageOn(birthDate, today);
  return age !== null && age < ADULT_AGE;
}

/**
 * Status changes a person can request by hand. TRANSFERRED is only reached through a transfer to
 * another church, and a deceased member cannot return.
 */
export const MANUAL_STATUS_CHANGES: Readonly<
  Record<MemberStatus, readonly MemberStatus[]>
> = {
  ACTIVE: ['INACTIVE', 'DECEASED'],
  INACTIVE: ['ACTIVE', 'DECEASED'],
  TRANSFERRED: ['ACTIVE'],
  DECEASED: [],
};

/** A date written as YYYY-MM-DD that is not after `today`. */
export function assertPastOrToday(
  value: string,
  today: string,
  message: string,
  code = 'INVALID_DATE',
): void {
  if (!isIsoDate(value) || value > today) {
    throw new InvalidInputException(message, code);
  }
}

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
