import type {
  AuditEntry,
  AuditRecorder,
} from '../../src/common/audit/audit-recorder.port.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../src/common/persistence/transaction.js';
import { Clock } from '../../src/common/time/bogota-time.js';

/** Runs the work right away. Fakes of repositories apply their changes immediately, so there is nothing to commit. */
export class ImmediateTransactionRunner implements TransactionRunner {
  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return work({ kind: 'transaction' });
  }
}

/** Keeps every audit entry in memory so a test can assert what was recorded. */
export class RecordingAuditRecorder implements AuditRecorder {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

/** A clock that always answers the same instant (15:00 UTC is 10:00 in Bogota). */
export class FixedClock extends Clock {
  constructor(private readonly instant = new Date('2026-11-02T15:00:00.000Z')) {
    super();
  }

  now(): Date {
    return this.instant;
  }
}
