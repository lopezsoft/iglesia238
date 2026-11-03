import type { Transaction } from '../persistence/transaction.js';
import type { TenantScope } from '../tenancy/tenant-scope.js';

export const DOCUMENT_SEQUENCE_STORE = Symbol('DOCUMENT_SEQUENCE_STORE');

/** Persistence of the counters. The increment holds the row lock until the transaction ends. */
export interface DocumentSequenceStore {
  /** Increments the counter of the congregation and returns the new value (1 for the first). */
  next(
    scope: TenantScope,
    key: string,
    transaction: Transaction,
  ): Promise<number>;
}
