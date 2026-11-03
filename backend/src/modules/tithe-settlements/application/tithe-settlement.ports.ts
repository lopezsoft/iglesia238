import type { Page } from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type {
  BookingTargets,
  NewSettlement,
  SettlementDetailData,
  SettlementListQuery,
  SettlementRecord,
  TitheContributionData,
  TitheRangeView,
  TitheYearSummary,
  VoidOutcome,
  VoidSettlementInput,
} from './tithe-settlement.models.js';

export const TITHE_SETTLEMENT_READER = Symbol('TITHE_SETTLEMENT_READER');
export const TITHE_SETTLEMENT_WRITER = Symbol('TITHE_SETTLEMENT_WRITER');
export const TITHE_RULE_READER = Symbol('TITHE_RULE_READER');

export interface PeriodRecord {
  readonly id: number;
  readonly status: 'OPEN' | 'CLOSED';
}

export interface CongregationInfo {
  readonly name: string;
  readonly denominationName: string;
}

/**
 * Reads of the tithe settlement. Every method takes the TenantScope (a congregation scope for the
 * ones that read tithes and settlements), so nothing can be read without a tenant. Methods that run
 * inside a confirmation accept the open transaction.
 */
export interface TitheSettlementReader {
  findCongregation(scope: TenantScope): Promise<CongregationInfo | null>;
  /** Every tithe contribution received in the range, whatever its status. */
  findTithesInRange(
    scope: TenantScope,
    range: TitheRangeView,
    transaction?: Transaction,
  ): Promise<TitheContributionData[]>;
  /** An issued settlement whose range overlaps the given one. */
  findOverlapping(
    scope: TenantScope,
    range: TitheRangeView,
    transaction?: Transaction,
  ): Promise<SettlementRecord | null>;
  findLastIssuedRange(scope: TenantScope): Promise<TitheRangeView | null>;
  summarizeYear(scope: TenantScope, year: number): Promise<TitheYearSummary>;
  list(
    scope: TenantScope,
    query: SettlementListQuery,
  ): Promise<Page<SettlementRecord>>;
  findById(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<SettlementRecord | null>;
  findDetail(
    scope: TenantScope,
    id: number,
  ): Promise<SettlementDetailData | null>;
  /** Next number of the settlement vouchers, without reserving it. */
  peekNextVoucherNumber(scope: TenantScope): Promise<number>;
  findBookingTargets(
    scope: TenantScope,
    transaction?: Transaction,
  ): Promise<BookingTargets>;
  findPeriod(
    scope: TenantScope,
    year: number,
    month: number,
    transaction?: Transaction,
  ): Promise<PeriodRecord | null>;
}

/** Writes of the tithe settlement. They always run inside the transaction of the use case. */
export interface TitheSettlementWriter {
  /**
   * Creates the voucher, the settlement, links the tithes and posts the cash lines. When a tithe is
   * no longer settleable (voided or settled by someone else meanwhile) it throws a conflict.
   */
  create(
    scope: TenantScope,
    input: NewSettlement,
    transaction: Transaction,
  ): Promise<SettlementRecord>;
  /**
   * Marks the settlement as voided, reverses its cash lines, releases its tithes and voids the
   * voucher. It answers null when the settlement is not an issued one of the scope.
   */
  void(
    scope: TenantScope,
    id: number,
    input: VoidSettlementInput,
    transaction: Transaction,
  ): Promise<VoidOutcome | null>;
}

export interface TitheRuleRecord {
  readonly id: number;
  readonly effectiveFrom: string;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
}

/**
 * Percentages by validity date. They belong to the denomination and are entered in the accounting
 * setup; the settlement only reads the one in force.
 */
export interface TitheRuleReader {
  /** The latest rule that started on or before the date. */
  findInForce(
    denominationId: number,
    date: string,
    transaction?: Transaction,
  ): Promise<TitheRuleRecord | null>;
}
