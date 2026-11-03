import {
  compareYearMonth,
  displayDate,
  monthLabel,
  monthRange,
  signedCents,
  toCents,
  type YearMonth,
} from '../../../common/accounting/accounting-rules.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import type { PeriodRecord } from '../../../common/accounting/period-view.js';
import type {
  CashFundRecord,
  CashLineRecord,
  LineIndexEntry,
  PendingContribution,
  VoucherRef,
} from './cash-book.repository.js';

/**
 * Why a line cannot be reversed from the cash book (null when it can).
 * CONSOLIDATION_PERIOD_CLOSED: the line consolidates contributions of a closed period, which could
 * never be consolidated again once released.
 */
export type ReversalBlock =
  | 'IS_REVERSAL'
  | 'ALREADY_REVERSED'
  | 'CONTRIBUTION'
  | 'TITHE_SETTLEMENT'
  | 'CONSOLIDATION_PERIOD_CLOSED';

export function voucherCodeOf(voucher: VoucherRef | null): string {
  return voucher
    ? formatVoucherCode(voucher.type, voucher.issuedOn, voucher.number)
    : '—';
}

/** The sede has no period for the month, or it is not open. */
export function isMonthOpen(
  periods: readonly PeriodRecord[],
  month: YearMonth,
): boolean {
  return (
    periods.find((period) => compareYearMonth(period, month) === 0)?.status ===
    'OPEN'
  );
}

/** A line is a consolidation when it carries a CI voucher and contributions point to it. */
export function isConsolidation(line: CashLineRecord): boolean {
  return line.voucher?.type === 'CI' && line.consolidatedDates.length > 0;
}

export function reversalBlockOf(
  line: CashLineRecord,
  periods: readonly PeriodRecord[],
): ReversalBlock | null {
  if (line.reversalOfId !== null) {
    return 'IS_REVERSAL';
  }
  if (line.reversedBy !== null) {
    return 'ALREADY_REVERSED';
  }
  if (line.voucher?.type === 'REC') {
    return 'CONTRIBUTION';
  }
  if (line.voucher?.type === 'LD') {
    return 'TITHE_SETTLEMENT';
  }
  if (
    isConsolidation(line) &&
    line.consolidatedDates.some(
      (date) => !isMonthOpen(periods, yearMonthOfDate(date)),
    )
  ) {
    // Released, those contributions could never be consolidated again (consolidation posts on their date).
    return 'CONSOLIDATION_PERIOD_CLOSED';
  }
  return null;
}

function yearMonthOfDate(date: string): YearMonth {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) };
}

// --- Running balance -----------------------------------------------------------------------------

export interface BookTotals {
  /** Balance of the fund when the month starts. */
  readonly openingCents: number;
  readonly incomeCents: number;
  readonly expenseCents: number;
  readonly closingCents: number;
  readonly inCount: number;
  readonly outCount: number;
  /** Balance after each line, in posting order, by line id. */
  readonly balanceAfter: ReadonlyMap<number, number>;
}

/** Totals and running balances of a month from its lines in posting order. */
export function computeBookTotals(
  openingCents: number,
  index: readonly LineIndexEntry[],
): BookTotals {
  let running = openingCents;
  let income = 0;
  let expense = 0;
  let inCount = 0;
  let outCount = 0;
  const balanceAfter = new Map<number, number>();
  for (const line of index) {
    const cents = toCents(line.amount);
    running += signedCents(line.direction, cents);
    balanceAfter.set(line.id, running);
    if (line.direction === 'IN') {
      income += cents;
      inCount += 1;
    } else {
      expense += cents;
      outCount += 1;
    }
  }
  return {
    openingCents,
    incomeCents: income,
    expenseCents: expense,
    closingCents: openingCents + income - expense,
    inCount,
    outCount,
    balanceAfter,
  };
}

// --- Closing a period ----------------------------------------------------------------------------

export interface CloseBlock {
  readonly code: string;
  readonly message: string;
}

/** Why a period cannot be closed yet, or null when it can. */
export function closeBlockOf(input: {
  period: PeriodRecord;
  periods: readonly PeriodRecord[];
  today: string;
  pendingContributions: number;
}): CloseBlock | null {
  const { period, periods, today, pendingContributions } = input;
  if (period.status === 'CLOSED') {
    return {
      code: 'PERIOD_ALREADY_CLOSED',
      message: 'El periodo ya está cerrado.',
    };
  }
  const previousOpen = periods
    .filter(
      (other) => other.status === 'OPEN' && compareYearMonth(other, period) < 0,
    )
    .toSorted(compareYearMonth)
    .at(-1);
  if (previousOpen) {
    return {
      code: 'PREVIOUS_PERIOD_OPEN',
      message: `Cierra primero ${monthLabel(previousOpen)}: los periodos se cierran en orden.`,
    };
  }
  const { to } = monthRange(period);
  if (to >= today) {
    return {
      code: 'PERIOD_NOT_ENDED',
      message: `${monthLabel(period)} aún no termina: podrás cerrarlo después del ${displayDate(to)}.`,
    };
  }
  if (pendingContributions > 0) {
    return {
      code: 'PENDING_CONSOLIDATION',
      message: `Hay ${pendingContributions} ${pendingContributions === 1 ? 'aporte pendiente' : 'aportes pendientes'} de consolidar en el periodo: consolídalos antes de cerrarlo.`,
    };
  }
  return null;
}

/** Dates that fall in an open period, up to today (nothing is dated after today). */
export function openRangeOf(
  periods: readonly PeriodRecord[],
  today: string,
): { min: string; max: string } | null {
  const open = periods
    .filter((period) => period.status === 'OPEN')
    .toSorted(compareYearMonth);
  if (open.length === 0) {
    return null;
  }
  const min = monthRange(open[0]).from;
  const lastOpenDay = monthRange(open[open.length - 1]).to;
  const max = lastOpenDay < today ? lastOpenDay : today;
  return max < min ? null : { min, max };
}

// --- Consolidation -------------------------------------------------------------------------------

/**
 * Fund a contribution lands in: the one its account suggests, or the oldest active fund of the
 * denomination when the account suggests none. Null when there is no fund to land in.
 */
export function targetFundOf(
  defaultFundId: number | null,
  funds: readonly CashFundRecord[],
): number | null {
  if (defaultFundId !== null) {
    return defaultFundId;
  }
  return (
    funds.filter((fund) => fund.isActive).toSorted((a, b) => a.id - b.id)[0]
      ?.id ?? null
  );
}

export interface PendingGroup {
  readonly accountId: number;
  readonly fundId: number;
  readonly count: number;
  readonly amountCents: number;
  readonly contributionIds: readonly number[];
}

/** Pending contributions grouped by income account and destination fund. */
export function groupPending(
  pending: readonly PendingContribution[],
  fundOf: (contribution: PendingContribution) => number,
): PendingGroup[] {
  const groups = new Map<string, PendingGroup>();
  for (const contribution of pending) {
    const fundId = fundOf(contribution);
    const key = `${contribution.accountId}:${fundId}`;
    const current = groups.get(key);
    groups.set(key, {
      accountId: contribution.accountId,
      fundId,
      count: (current?.count ?? 0) + 1,
      amountCents: (current?.amountCents ?? 0) + toCents(contribution.amount),
      contributionIds: [...(current?.contributionIds ?? []), contribution.id],
    });
  }
  return [...groups.values()];
}
