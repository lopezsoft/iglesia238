import type { PeriodRecord } from '../../../common/accounting/period-view.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';

export const PERIOD_REPOSITORY = Symbol('SETUP_PERIOD_REPOSITORY');

/** Accounting periods of one congregation (the scope must have a congregation). */
export interface PeriodRepository {
  /** Newest first. */
  list(scope: TenantScope): Promise<PeriodRecord[]>;
  create(
    scope: TenantScope,
    data: { year: number; month: number },
    transaction: Transaction,
  ): Promise<PeriodRecord>;
}
