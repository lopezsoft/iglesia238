import type { PeriodRecord } from '../../../common/accounting/period-view.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';

export const CASH_BOOK_REPOSITORY = Symbol('CASH_BOOK_REPOSITORY');

export type Direction = 'IN' | 'OUT';

export interface CashFundRecord {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface CashAccountRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly nature: 'INCOME' | 'EXPENSE';
  readonly isPostable: boolean;
  readonly isActive: boolean;
  readonly defaultFundId: number | null;
}

/** Just enough of every line of a fund and period to compute the running balance. */
export interface LineIndexEntry {
  readonly id: number;
  readonly direction: Direction;
  readonly amount: number;
}

/** The voucher a cash line carries, or points to through its reversal. */
export interface VoucherRef {
  readonly type: string;
  readonly number: number;
  /** 'YYYY-MM-DD'. */
  readonly issuedOn: string;
}

export interface CashLineRecord {
  readonly id: number;
  readonly postedOn: string;
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundId: number;
  readonly description: string;
  readonly direction: Direction;
  readonly amount: number;
  readonly voucher: VoucherRef | null;
  /** Set on a reversal. */
  readonly reversalOfId: number | null;
  /** Voucher of the original line, on a reversal. */
  readonly reversalOfVoucher: VoucherRef | null;
  /** The reversal of this line, if it was reversed. */
  readonly reversedBy: {
    readonly id: number;
    readonly voucher: VoucherRef | null;
  } | null;
  /** Distinct reception dates of the contributions consolidated by this line. */
  readonly consolidatedDates: readonly string[];
}

export interface LineFilter {
  readonly fundId: number;
  readonly periodId: number;
  readonly direction?: Direction;
  readonly accountId?: number;
  /** Matches the description, the account code or the account name. */
  readonly search?: string;
  readonly skip: number;
  readonly take: number;
}

export interface PendingContribution {
  readonly id: number;
  readonly amount: number;
  readonly receivedOn: string;
  readonly accountId: number;
  readonly defaultFundId: number | null;
}

export interface NewTransaction {
  readonly periodId: number;
  readonly accountId: number;
  readonly fundId: number;
  readonly voucherId: number;
  readonly direction: Direction;
  readonly postedOn: string;
  readonly amount: number;
  readonly description: string;
  readonly reversalOfId: number | null;
  readonly createdById: number;
}

/** Persistence of the cash book of one congregation (every method but the catalogs needs one). */
export interface CashBookRepository {
  // Catalogs of the denomination
  listFunds(scope: TenantScope): Promise<CashFundRecord[]>;
  findFund(scope: TenantScope, id: number): Promise<CashFundRecord | null>;
  /** Active accounts that receive movements, ordered by code. */
  listPostableAccounts(scope: TenantScope): Promise<CashAccountRecord[]>;
  /** Any account of the denomination, with its fund suggestion. */
  listAccounts(
    scope: TenantScope,
    ids: readonly number[],
  ): Promise<CashAccountRecord[]>;
  findAccount(
    scope: TenantScope,
    id: number,
  ): Promise<CashAccountRecord | null>;

  // Periods of the congregation
  /** Newest first. */
  listPeriods(scope: TenantScope): Promise<PeriodRecord[]>;
  findPeriod(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<PeriodRecord | null>;
  closePeriod(
    scope: TenantScope,
    id: number,
    closedAt: Date,
    transaction: Transaction,
  ): Promise<PeriodRecord>;
  /** Opens the month if the congregation does not have it. Returns the existing or new period. */
  ensurePeriod(
    scope: TenantScope,
    period: { year: number; month: number },
    transaction: Transaction,
  ): Promise<PeriodRecord>;
  /**
   * Gives each fund of the congregation the balance it ends `year` with as the opening balance of the
   * next year, unless that opening balance already exists. Returns the funds that received one.
   */
  carryOpeningBalances(
    scope: TenantScope,
    year: number,
    transaction: Transaction,
  ): Promise<number>;

  // Reading the book
  lineIndex(
    scope: TenantScope,
    fundId: number,
    periodId: number,
  ): Promise<LineIndexEntry[]>;
  /** Opening balance of the year and net movement of the fund between January 1 and `beforeDate`. */
  openingBase(
    scope: TenantScope,
    fundId: number,
    year: number,
    beforeDate: string,
  ): Promise<{ yearOpening: number; movedBefore: number }>;
  findLines(
    scope: TenantScope,
    filter: LineFilter,
  ): Promise<{ rows: CashLineRecord[]; total: number }>;
  findLine(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<CashLineRecord | null>;
  /** Number the next voucher of the type would get; it does not reserve it. */
  peekNextVoucherNumber(scope: TenantScope, type: string): Promise<number>;

  // Writing the book
  createVoucher(
    scope: TenantScope,
    data: { type: string; number: number; issuedOn: string },
    transaction: Transaction,
  ): Promise<{ id: number }>;
  createTransaction(
    scope: TenantScope,
    data: NewTransaction,
    transaction: Transaction,
  ): Promise<{ id: number }>;

  // Contributions waiting to reach the book
  listPendingContributions(
    scope: TenantScope,
    date: string,
  ): Promise<PendingContribution[]>;
  countPendingContributions(
    scope: TenantScope,
    from: string,
    to: string,
  ): Promise<number>;
  /** Links the contributions that are still pending; returns how many were linked. */
  linkContributions(
    scope: TenantScope,
    ids: readonly number[],
    cashTransactionId: number,
    transaction: Transaction,
  ): Promise<number>;
  releaseContributions(
    scope: TenantScope,
    cashTransactionId: number,
    transaction: Transaction,
  ): Promise<number>;
}
