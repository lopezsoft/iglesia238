export const TRANSACTION_RUNNER = Symbol('TRANSACTION_RUNNER');

/**
 * Opaque handle of an open database transaction. Use cases pass it from one port to another so several
 * writes commit or roll back together; only the infrastructure knows what is inside.
 */
export interface Transaction {
  readonly kind: 'transaction';
}

export interface TransactionRunner {
  /** Runs the work in one transaction: it commits when the work resolves and rolls back when it throws. */
  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
}
