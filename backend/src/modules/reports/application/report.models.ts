export type PeriodStatusValue = 'OPEN' | 'CLOSED';
export type AccountNatureValue = 'INCOME' | 'EXPENSE';
export type ContributionCategoryValue =
  'TITHE' | 'OFFERING' | 'FIRST_FRUITS' | 'VOW' | 'OTHER';
export type PaymentMethodValue =
  'CASH' | 'BANK_TRANSFER' | 'CARD' | 'BANK_DEPOSIT' | 'OTHER';
export type ContributionDetailStatus = 'RECORDED' | 'SETTLED' | 'VOIDED';

/** Inclusive range of dates (YYYY-MM-DD) of a single calendar year, optionally one fund or one sede. */
export interface ReportQuery {
  readonly from: string;
  readonly to: string;
  /** Null: every fund. */
  readonly fundId: number | null;
  /** Null: every sede of the scope. A denomination-wide session can narrow the report to one sede. */
  readonly congregationId: number | null;
}

// ---------- Data the reader returns ----------

export interface CongregationData {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface FundData {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface AccountData {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNatureValue;
}

export interface ContributionTypeData {
  readonly id: number;
  readonly name: string;
  readonly category: ContributionCategoryValue;
  readonly accountId: number;
}

/** Net cash movement of the range grouped by sede, fund, account and direction. */
export interface CashSumRow {
  readonly congregationId: number;
  readonly fundId: number;
  readonly accountId: number;
  readonly direction: 'IN' | 'OUT';
  readonly amount: number;
}

export interface OpeningBalanceRow {
  readonly fundId: number;
  readonly amount: number;
}

export interface PeriodData {
  readonly congregationId: number;
  readonly month: number;
  readonly status: PeriodStatusValue;
}

export interface ContributionTypeSum {
  readonly contributionTypeId: number;
  readonly count: number;
  readonly amount: number;
}

/** Recorded contributions that the cash book has not consolidated yet: they are not cash income. */
export interface PendingConsolidation {
  readonly count: number;
  readonly amount: number;
}

export interface DailyAmount {
  readonly date: string;
  readonly amount: number;
}

export interface ContributionDetailData {
  readonly id: number;
  readonly receivedOn: string;
  readonly receipt: string | null;
  readonly congregationName: string;
  readonly contributionType: string;
  readonly contributorName: string | null;
  readonly paymentMethod: PaymentMethodValue;
  readonly paymentReference: string | null;
  readonly fundName: string | null;
  readonly amount: number;
  readonly status: ContributionDetailStatus;
}

// ---------- Views ----------

export interface ReportFundOption {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface ReportCongregationOption {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface ReportOptions {
  readonly scopeLabel: string;
  /** True for "Toda la denominación": figures add every sede and come with a per-sede breakdown. */
  readonly denominationWide: boolean;
  readonly funds: readonly ReportFundOption[];
  /** Sedes the report can be narrowed to; empty for a session fixed on one sede. */
  readonly congregations: readonly ReportCongregationOption[];
  /** Today in Bogota: the default range is its whole year. */
  readonly today: string;
}

export interface MoneyTotals {
  readonly income: number;
  readonly expense: number;
  /** income - expense. */
  readonly balance: number;
}

export interface ReportMonth extends MoneyTotals {
  readonly year: number;
  readonly month: number;
  /** "Octubre 2026". */
  readonly label: string;
  /** "Oct." */
  readonly shortLabel: string;
  /** CLOSED only when every sede closed the month; null when no period exists. */
  readonly periodStatus: PeriodStatusValue | null;
}

/** closing = opening + inflows - outflows. */
export interface ReportFundBalance {
  readonly fundId: number;
  readonly name: string;
  readonly opening: number;
  readonly inflows: number;
  readonly outflows: number;
  readonly closing: number;
}

export interface ReportContributionType {
  readonly contributionTypeId: number;
  readonly name: string;
  readonly category: ContributionCategoryValue;
  readonly count: number;
  readonly amount: number;
  /** 0-1 of the contributions total. */
  readonly share: number;
}

export interface ReportCongregation extends MoneyTotals {
  readonly congregationId: number;
  readonly name: string;
}

export interface ReportAccount {
  readonly accountId: number;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNatureValue;
  /** Income accounts add what came in and subtract reversals; expense accounts the opposite. */
  readonly amount: number;
}

export interface FinancialReport {
  readonly query: ReportQuery;
  readonly scopeLabel: string;
  /** "Todos los fondos" or the fund name. */
  readonly fundLabel: string;
  readonly totals: MoneyTotals;
  /** Same number of days right before `from`. */
  readonly previous: MoneyTotals & {
    readonly from: string;
    readonly to: string;
  };
  readonly months: readonly ReportMonth[];
  readonly funds: readonly ReportFundBalance[];
  /** Income statement by account, ordered by code. */
  readonly accounts: readonly ReportAccount[];
  readonly contributionTypes: readonly ReportContributionType[];
  readonly contributionsTotal: number;
  readonly contributionsCount: number;
  /** Recorded in the range but not yet consolidated in the cash book, so absent from income and balances. */
  readonly pendingConsolidation: PendingConsolidation;
  /** Income on accounts that are not a contribution type (donations, interest, activities). */
  readonly otherIncome: number;
  /** Only for a denomination-wide report. */
  readonly congregations: readonly ReportCongregation[] | null;
  readonly closedPeriods: number;
  readonly openPeriods: number;
}
