import {
  Account,
  AccountNature,
  ContributionCategory,
  ContributionType,
  Fund,
  PeriodOption,
} from '../../data/accounting.models';

export interface SetupOverview {
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
