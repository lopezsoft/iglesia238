import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { AccountNatureValue } from './setup.views.js';

export const ACCOUNT_REPOSITORY = Symbol('ACCOUNT_REPOSITORY');

export interface AccountRecord {
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
}

export interface AccountFacts {
  /** Cash lines or budget lines point to the account. */
  readonly hasMovements: boolean;
  readonly linkedTypes: number;
  readonly activeLinkedTypes: number;
}

export interface AccountData {
  readonly parentId: number | null;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNatureValue;
  readonly isPostable: boolean;
  readonly defaultFundId: number | null;
}

/** The chart of accounts belongs to the denomination. */
export interface AccountRepository {
  list(scope: TenantScope): Promise<AccountRecord[]>;
  find(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<AccountRecord | null>;
  /** Facts of every account of the denomination. */
  facts(scope: TenantScope): Promise<ReadonlyMap<number, AccountFacts>>;
  create(
    scope: TenantScope,
    data: AccountData,
    transaction: Transaction,
  ): Promise<AccountRecord>;
  update(
    scope: TenantScope,
    id: number,
    data: Partial<
      Pick<
        AccountRecord,
        'code' | 'name' | 'isPostable' | 'defaultFundId' | 'isActive'
      >
    >,
    transaction: Transaction,
  ): Promise<AccountRecord>;
  delete(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<void>;
}
