import type {
  AuditEntry,
  AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';

/** Runs the work right away and counts the transactions, so a test can prove an operation was atomic. */
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

/** A clock that stands still at noon in Bogota (UTC-5), whatever the time zone of the machine. */
export class FixedClock extends Clock {
  constructor(private instant: Date) {
    super();
  }

  static at(isoDate: string): FixedClock {
    return new FixedClock(new Date(`${isoDate}T17:00:00.000Z`));
  }

  now(): Date {
    return this.instant;
  }
}

/** The tenant context of a request made under `scope`, holding the given permissions. */
export function tenantFor(
  scope: TenantScope,
  permissions: readonly string[],
  userId = 7,
): TenantContext {
  const congregational = scope.congregationId !== null;
  return new TenantContext({
    userId,
    sessionId: 'session-test',
    scopeKey: congregational
      ? `C:${scope.congregationId}`
      : `D:${scope.denominationId}`,
    kind: congregational ? 'CONGREGATION' : 'DENOMINATION',
    denominationId: scope.denominationId,
    congregationId: scope.congregationId,
    roleCodes: [],
    permissions: new Set(permissions),
  });
}
