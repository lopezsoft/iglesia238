/** Vocabulary of contributions (diezmos, ofrendas, primicias y abonos a votos). */

export const CONTRIBUTION_CATEGORIES = [
  'TITHE',
  'OFFERING',
  'FIRST_FRUITS',
  'VOW',
  'OTHER',
] as const;
export type ContributionCategory = (typeof CONTRIBUTION_CATEGORIES)[number];

/** Categories the summary always shows, even with zero contributions. OTHER only appears when used. */
export const MAIN_CATEGORIES: readonly ContributionCategory[] = [
  'TITHE',
  'OFFERING',
  'FIRST_FRUITS',
  'VOW',
];

export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CARD',
  'BANK_DEPOSIT',
  'OTHER',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** What the table stores: a contribution is recorded or voided, never deleted. */
export type ContributionStatus = 'RECORDED' | 'VOIDED';

/** What the user sees: a recorded contribution inside a tithe settlement is SETTLED. */
export const CONTRIBUTION_DISPLAY_STATUSES = [
  'RECORDED',
  'SETTLED',
  'VOIDED',
] as const;
export type ContributionDisplayStatus =
  (typeof CONTRIBUTION_DISPLAY_STATUSES)[number];

/**
 * Why a contribution cannot be voided: SETTLED (part of a tithe settlement) or CONSOLIDATED
 * (part of a cash-book consolidation, which must be reversed first).
 */
export type ContributionVoidBlock = 'SETTLED' | 'CONSOLIDATED';

export type PeriodStatus = 'OPEN' | 'CLOSED';

/** Safety net for exports so a request cannot read the whole table. */
export const MAX_EXPORT_ROWS = 20_000;
