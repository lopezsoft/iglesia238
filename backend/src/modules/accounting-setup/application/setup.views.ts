import type { PeriodView } from '../../../common/accounting/period-view.js';

export type AccountNatureValue = 'INCOME' | 'EXPENSE';
export type ContributionCategoryValue =
  'TITHE' | 'OFFERING' | 'FIRST_FRUITS' | 'VOW' | 'OTHER';

export const CONTRIBUTION_CATEGORIES: readonly ContributionCategoryValue[] = [
  'TITHE',
  'OFFERING',
  'FIRST_FRUITS',
  'VOW',
  'OTHER',
];

export interface PeriodOptionView {
  readonly year: number;
  readonly month: number;
  readonly status: 'OPEN' | 'CLOSED';
  readonly label: string;
}

export interface TitheRuleView {
  readonly id: number;
  readonly denominationId: number;
  /** 'YYYY-MM-DD'. */
  readonly effectiveFrom: string;
  /** 0-1 (Decimal(5,4)). */
  readonly nationalShareRate: number;
  readonly localFundRate: number;
  /** The rule that applies today. */
  readonly inForce: boolean;
  /** Settlements were issued under it: it can no longer be edited nor deleted. */
  readonly inUse: boolean;
}

export interface SetupOverviewView {
  /** Today in America/Bogota ('YYYY-MM-DD'). */
  readonly today: string;
  readonly year: number;
  readonly activeFunds: number;
  readonly totalFunds: number;
  /** Opening balance of the active funds in the sede (or all sedes when denomination-wide). */
  readonly openingTotal: number;
  /** Period containing today in the sede; null when denomination-wide or not created. */
  readonly currentPeriod: PeriodOptionView | null;
  /** False when acting on "Toda la denominación": opening balances are read-only. */
  readonly congregationScoped: boolean;
  readonly scopeLabel: string;
  /** Periods the sede has; null when denomination-wide. */
  readonly periodsCount: number | null;
  /** Tithe rule in force today, null when the denomination has not entered its percentages yet. */
  readonly titheRule: TitheRuleView | null;
}

export interface FundRowView {
  readonly id: number;
  readonly denominationId: number;
  readonly name: string;
  readonly isActive: boolean;
  /** Opening balance of the year in the sede, or the sum of every sede when denomination-wide. */
  readonly openingBalance: number;
  /** True when the sede already has cash lines of this fund in the year (balance locked). */
  readonly openingLocked: boolean;
  /** True when the fund has movements, budget lines or default accounts (it cannot be deleted). */
  readonly inUse: boolean;
}

export interface AccountRowView {
  readonly id: number;
  readonly denominationId: number;
  readonly defaultFundId: number | null;
  readonly parentId: number | null;
  readonly code: string;
  readonly legacyCode: string | null;
  readonly name: string;
  readonly nature: AccountNatureValue;
  readonly isPostable: boolean;
  readonly isActive: boolean;
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly hasMovements: boolean;
  readonly linkedTypes: number;
  readonly defaultFundName: string | null;
}

export interface ContributionTypeRowView {
  readonly id: number;
  readonly denominationId: number;
  readonly category: ContributionCategoryValue;
  readonly code: string;
  readonly name: string;
  readonly accountId: number;
  readonly isActive: boolean;
  readonly accountCode: string;
  readonly accountName: string;
  readonly contributionCount: number;
}

export type PeriodRowView = PeriodView;
