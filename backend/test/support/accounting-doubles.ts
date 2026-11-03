import type {
  AuditEntry,
  AuditRecorder,
} from '../../src/common/audit/audit-recorder.port.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../src/common/persistence/transaction.js';
import type { TenantContext } from '../../src/common/tenancy/tenant-context.js';
import type { TenantScope } from '../../src/common/tenancy/tenant-scope.js';
import { Clock } from '../../src/common/time/bogota-time.js';
import { buildTenantContext } from './tenants.js';

/** Runs the work right away; counts the transactions so a test can prove an operation was atomic. */
export class FakeTransactionRunner implements TransactionRunner {
  readonly handle: Transaction = { kind: 'transaction' };
  runs = 0;

  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    this.runs += 1;
    return work(this.handle);
  }
}

/** Keeps the audit entries in memory. */
export class FakeAuditRecorder implements AuditRecorder {
  readonly entries: AuditEntry[] = [];

  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }

  get last(): AuditEntry | undefined {
    return this.entries.at(-1);
  }
}

/** A clock that stands still, in Bogota time. */
export class FixedClock extends Clock {
  constructor(private instant: Date) {
    super();
  }

  static at(isoDate: string): FixedClock {
    // Noon in Bogota (UTC-5): the Bogota date is the given one whatever the server time zone.
    return new FixedClock(new Date(`${isoDate}T17:00:00.000Z`));
  }

  now(): Date {
    return this.instant;
  }

  set(isoDate: string): void {
    this.instant = new Date(`${isoDate}T17:00:00.000Z`);
  }
}

/** A TenantContext with the given permissions for the scope of a repository test. */
export function contextFor(
  scope: TenantScope,
  permissions: readonly string[] = [],
): TenantContext {
  return buildTenantContext({
    kind: scope.congregationId === null ? 'DENOMINATION' : 'CONGREGATION',
    denominationId: scope.denominationId,
    congregationId: scope.congregationId,
    permissions,
  });
}
