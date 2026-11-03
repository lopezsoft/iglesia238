import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';

export const VOW_PLEDGE_STATUSES = [
  'ACTIVE',
  'FULFILLED',
  'CANCELLED',
] as const;
export type VowPledgeStatus = (typeof VOW_PLEDGE_STATUSES)[number];

/** A pledge without a payment for this many days is shown as "sin abonos recientes". */
export const STALE_DAYS = 90;
const DAY_MS = 86_400_000;

/** VOTO-2026-0014: year of the promise and the id of the pledge. */
export function vowPledgeCode(pledge: {
  id: number;
  pledgedOn: string;
}): string {
  return `VOTO-${pledge.pledgedOn.slice(0, 4)}-${String(pledge.id).padStart(4, '0')}`;
}

/** The id inside a code typed by the user ("voto-2026-0014" or "VOTO-2026-14"), or null. */
export function pledgeIdFromCode(text: string): number | null {
  const match = /^VOTO-\d{4}-(\d{1,10})$/i.exec(text.trim());
  return match ? Number(match[1]) : null;
}

/** Amount still to collect; never negative. */
export function vowBalance(pledgedAmount: number, paid: number): number {
  return fromCents(Math.max(0, toCents(pledgedAmount) - toCents(paid)));
}

/** 0 to 100. */
export function vowProgress(pledgedAmount: number, paid: number): number {
  const pledged = toCents(pledgedAmount);
  return pledged > 0
    ? Math.min(100, Math.round((toCents(paid) / pledged) * 100))
    : 0;
}

/**
 * Status of a pledge: CANCELLED is a decision and stays; otherwise it is FULFILLED once the
 * payments reach the promise and ACTIVE while they do not. Voiding a payment reopens a fulfilled pledge.
 */
export function vowPledgeStatusFor(
  stored: VowPledgeStatus,
  pledgedAmount: number,
  paid: number,
): VowPledgeStatus {
  if (stored === 'CANCELLED') {
    return 'CANCELLED';
  }
  return toCents(paid) >= toCents(pledgedAmount) ? 'FULFILLED' : 'ACTIVE';
}

export function daysBetween(from: string, to: string): number {
  return Math.floor(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS,
  );
}

/** Active pledge whose last payment (or the promise itself) is older than STALE_DAYS. */
export function isStalePledge(
  pledge: { pledgedOn: string; lastPaymentOn: string | null },
  today: string,
): boolean {
  return (
    daysBetween(pledge.lastPaymentOn ?? pledge.pledgedOn, today) > STALE_DAYS
  );
}
