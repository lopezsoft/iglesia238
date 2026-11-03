import type {
  AccountData,
  CashSumRow,
  CongregationData,
  ContributionDetailData,
  ContributionTypeData,
  ContributionTypeSum,
  DailyAmount,
  FundData,
  OpeningBalanceRow,
  PendingConsolidation,
  PeriodData,
} from '../report.models.js';

export const FINANCIAL_DATA_READER = Symbol('FINANCIAL_DATA_READER');

/** Sedes whose figures are added. The ids always belong to the denomination of the session. */
export interface DataFilter {
  readonly denominationId: number;
  readonly congregationIds: readonly number[];
  /** Null: every fund. */
  readonly fundId: number | null;
}

export interface DateSpan {
  readonly from: string;
  readonly to: string;
}

/**
 * Read side of the financial reports and of the finance widgets of the dashboard. Every method
 * aggregates in the database (one grouped query each), so the cost does not grow with the movements.
 */
export interface FinancialDataReader {
  denominationName(denominationId: number): Promise<string | null>;
  /** Every sede of the denomination, active or not: a deactivated sede can still own movements. */
  listCongregations(denominationId: number): Promise<CongregationData[]>;
  listFunds(denominationId: number): Promise<FundData[]>;
  listAccounts(denominationId: number): Promise<AccountData[]>;
  listContributionTypes(
    denominationId: number,
  ): Promise<ContributionTypeData[]>;

  /** Cash movements of the span grouped by sede, fund, account and direction (reversals included). */
  sumCash(filter: DataFilter, span: DateSpan): Promise<CashSumRow[]>;
  /** Opening balances of the year added over the sedes, one row per fund. */
  sumOpeningBalances(
    filter: DataFilter,
    year: number,
  ): Promise<OpeningBalanceRow[]>;
  listPeriods(filter: DataFilter, year: number): Promise<PeriodData[]>;

  /** Recorded contributions of the span grouped by type. */
  sumContributions(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<ContributionTypeSum[]>;
  /** Recorded contributions per day; days without contributions are absent. */
  /** Recorded contributions of the span with no cash line yet (not consolidated in the cash book). */
  sumPendingConsolidation(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<PendingConsolidation>;
  sumContributionsByDay(
    filter: DataFilter,
    span: DateSpan,
  ): Promise<DailyAmount[]>;
  countContributions(filter: DataFilter, span: DateSpan): Promise<number>;
  /** Every contribution of the span, whatever its status, oldest first. */
  listContributionDetail(
    filter: DataFilter,
    span: DateSpan,
    limit: number,
  ): Promise<ContributionDetailData[]>;
}
