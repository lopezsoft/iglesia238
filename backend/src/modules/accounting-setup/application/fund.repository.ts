import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';

export const FUND_REPOSITORY = Symbol('FUND_REPOSITORY');

export interface FundRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly name: string;
  readonly isActive: boolean;
}

/** What the rest of the books say about a fund; the service decides what it may do from it. */
export interface FundFacts {
  /** Opening balance of the year: of the sede in the scope, or the sum of every sede. */
  readonly openingBalance: number;
  /** The sede in the scope has cash lines of the fund in the year. False without a sede. */
  readonly hasMovementsInYear: boolean;
  /** Any cash line of the fund in the denomination. */
  readonly hasMovements: boolean;
  readonly hasBudgetLines: boolean;
  /** Accounts that suggest the fund as their default. */
  readonly suggestingAccounts: number;
  readonly suggestingActiveAccounts: number;
  /** Any opening balance different from zero, in any sede and year. */
  readonly hasOpeningBalances: boolean;
}

export const EMPTY_FUND_FACTS: FundFacts = {
  openingBalance: 0,
  hasMovementsInYear: false,
  hasMovements: false,
  hasBudgetLines: false,
  suggestingAccounts: 0,
  suggestingActiveAccounts: 0,
  hasOpeningBalances: false,
};

/** Funds belong to the denomination: the scope's congregation only narrows the balances. */
export interface FundRepository {
  list(scope: TenantScope): Promise<FundRecord[]>;
  find(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<FundRecord | null>;
  /** Facts of the given funds (every fund when omitted) for a year. */
  facts(
    scope: TenantScope,
    year: number,
    fundIds?: readonly number[],
  ): Promise<ReadonlyMap<number, FundFacts>>;
  create(
    scope: TenantScope,
    data: { name: string; isActive: boolean },
    transaction: Transaction,
  ): Promise<FundRecord>;
  update(
    scope: TenantScope,
    id: number,
    data: { name: string; isActive: boolean },
    transaction: Transaction,
  ): Promise<FundRecord>;
  delete(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<void>;
  /** Opening balance of one sede (the scope must have a congregation); 0 when there is none. */
  getOpeningBalance(
    scope: TenantScope,
    fundId: number,
    year: number,
    transaction: Transaction,
  ): Promise<number>;
  setOpeningBalance(
    scope: TenantScope,
    fundId: number,
    year: number,
    amount: number,
    transaction: Transaction,
  ): Promise<void>;
  /** Removes the opening balances of a fund in every sede (only used when it is deleted). */
  deleteOpeningBalances(
    scope: TenantScope,
    fundId: number,
    transaction: Transaction,
  ): Promise<void>;
}
