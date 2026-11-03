import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';

export const TITHE_RULE_REPOSITORY = Symbol('TITHE_RULE_REPOSITORY');

export interface TitheRuleRecord {
  readonly id: number;
  readonly denominationId: number;
  /** 'YYYY-MM-DD'. */
  readonly effectiveFrom: string;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
}

export interface TitheRuleData {
  readonly effectiveFrom: string;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
}

/** Tithe settlement percentages of the denomination, with the date they start to apply. */
export interface TitheRuleRepository {
  /** Newest effectiveFrom first. */
  list(scope: TenantScope): Promise<TitheRuleRecord[]>;
  find(scope: TenantScope, id: number): Promise<TitheRuleRecord | null>;
  create(
    scope: TenantScope,
    data: TitheRuleData,
    transaction: Transaction,
  ): Promise<TitheRuleRecord>;
  update(
    scope: TenantScope,
    id: number,
    data: TitheRuleData,
    transaction: Transaction,
  ): Promise<TitheRuleRecord>;
  delete(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<void>;
  /**
   * Settlements still in force (not voided) of the denomination settled from `from` (included) up to
   * `toExclusive` (null: no upper bound).
   */
  countIssuedSettlements(
    scope: TenantScope,
    from: string,
    toExclusive: string | null,
  ): Promise<number>;
}
