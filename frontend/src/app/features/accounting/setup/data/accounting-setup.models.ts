import {
  Account,
  AccountNature,
  ContributionCategory,
  ContributionType,
  Fund,
  PeriodOption,
  PeriodStatus,
} from '../../data/accounting.models';

/**
 * Tithe settlement percentages in force from a date. They are entered by the denomination:
 * the app never proposes a value. Rates are fractions between 0 and 1 (0.21 is 21 %).
 */
export interface TitheRuleRow {
  readonly id: number;
  readonly denominationId: number;
  /** 'YYYY-MM-DD'. */
  readonly effectiveFrom: string;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
  /** The rule that applies today. */
  readonly inForce: boolean;
  /** Settlements were issued under it: it cannot be edited nor deleted. */
  readonly inUse: boolean;
}

export interface SetupOverview {
  /** Today in Bogota ('YYYY-MM-DD'), as the server sees it. */
  readonly today: string;
  readonly year: number;
  readonly activeFunds: number;
  readonly totalFunds: number;
  /** Opening balance of the active funds in the sede (or all sedes when denomination-wide). */
  readonly openingTotal: number;
  /** Period containing today in the sede; null when denomination-wide or not created. */
  readonly currentPeriod: PeriodOption | null;
  /** False when acting on "Toda la denominación": opening balances are read-only. */
  readonly congregationScoped: boolean;
  readonly scopeLabel: string;
  /** Periods the sede has; null when denomination-wide. */
  readonly periodsCount: number | null;
  /** Rule in force today; null while the denomination has not entered its percentages. */
  readonly titheRule: TitheRuleRow | null;
}

export interface FundRow extends Fund {
  /** Opening balance of the year in the sede, or the sum of every sede when denomination-wide. */
  readonly openingBalance: number;
  /** True when the sede already has cash lines of this fund in the year (balance locked). */
  readonly openingLocked: boolean;
  /** True when the fund has movements, budget lines or default accounts (it cannot be deleted). */
  readonly inUse: boolean;
}

export interface AccountRow extends Account {
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly hasMovements: boolean;
  readonly linkedTypes: number;
  readonly defaultFundName: string | null;
}

export interface ContributionTypeRow extends ContributionType {
  readonly accountCode: string;
  readonly accountName: string;
  readonly contributionCount: number;
}

/** Accounting period of the active sede. */
export interface PeriodRow {
  readonly id: number;
  readonly year: number;
  readonly month: number;
  readonly status: PeriodStatus;
  /** "Noviembre 2026". */
  readonly label: string;
  readonly closedAt: string | null;
  readonly from: string;
  readonly to: string;
}

export interface SaveFundCommand {
  readonly id: number | null;
  readonly name: string;
  readonly isActive: boolean;
  /** Null keeps the current opening balance (required when denomination-wide). */
  readonly openingBalance: number | null;
}

export interface SaveAccountCommand {
  readonly id: number | null;
  readonly parentId: number | null;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNature;
  readonly isPostable: boolean;
  readonly defaultFundId: number | null;
}

export interface SaveContributionTypeCommand {
  readonly id: number | null;
  readonly code: string;
  readonly name: string;
  readonly category: ContributionCategory;
  readonly accountId: number;
}

export interface OpenPeriodCommand {
  readonly year: number;
  readonly month: number;
}

export interface SaveTitheRuleCommand {
  /** Null creates a rule. */
  readonly id: number | null;
  readonly effectiveFrom: string;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
}
