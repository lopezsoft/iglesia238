import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
} from '../../../../test/support/tenants.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { InMemoryAttendanceRepository } from '../testing/in-memory-attendance.repository.js';
import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
  tenantFor,
} from '../testing/test-doubles.js';
import { CorrectAttendanceSession } from './correct-attendance-session.use-case.js';
import { DeleteAttendanceSession } from './delete-attendance-session.use-case.js';

const WRITE = ['attendance.write'];

// The world created by the last `arrange` of a cross-tenant test.
let current: ReturnType<typeof setup>;

function setup() {
  const repository = new InMemoryAttendanceRepository();
  const audit = new FakeAuditRecorder();
  const transactions = new FakeTransactionRunner();
  const clock = FixedClock.at('2026-11-02');
  return {
    repository,
    audit,
    transactions,
    correct: new CorrectAttendanceSession(
      repository,
      transactions,
      audit,
      clock,
    ),
    remove: new DeleteAttendanceSession(repository, transactions, audit),
  };
}

describe('CorrectAttendanceSession', () => {
  it('replaces the counts, restamps who recorded them and audits the old and new total', async () => {
    const { correct, repository, audit } = setup();
    const existing = repository.seed(1, 10, '2026-10-25', [10, 10, 10, 10, 10]);

    const updated = await correct.execute(
      tenantFor(TENANT_A, WRITE, 9),
      existing.id,
      [
        { categoryCode: 'CHILDREN', headcount: 1 },
        { categoryCode: 'MEN', headcount: 4 },
      ],
    );

    expect(updated.total).toBe(5);
    expect(updated.sessionDate).toBe('2026-10-25');
    expect(updated.recordedBy).toBe('Usuario 9');
    expect(audit.last).toMatchObject({
      action: 'ATTENDANCE_UPDATED',
      changes: { total: { from: 50, to: 5 } },
    });
  });

  it('keeps the one-session-per-key invariant: it updates, never duplicates', async () => {
    const { correct, repository } = setup();
    const existing = repository.seed(1, 10, '2026-10-25', [1, 1, 1, 1, 1]);

    await correct.execute(tenantFor(TENANT_A, WRITE), existing.id, [
      { categoryCode: 'WOMEN', headcount: 2 },
    ]);

    expect(repository.sessions).toHaveLength(1);
  });

  it('rejects an empty correction and keeps the previous counts', async () => {
    const { correct, repository } = setup();
    const existing = repository.seed(1, 10, '2026-10-25', [1, 1, 1, 1, 1]);

    await expect(
      correct.execute(tenantFor(TENANT_A, WRITE), existing.id, []),
    ).rejects.toMatchObject({ code: 'EMPTY_SESSION' });
    expect(repository.sessions[0].total).toBe(5);
  });

  describeCrossTenantIsolation('CorrectAttendanceSession', {
    arrange: () => {
      const world = setup();
      current = world;
      return world.repository.seed(1, 10, '2026-10-25', [1, 1, 1, 1, 1]).id;
    },
    act: (scope: TenantScope, id: number) =>
      current.correct.execute(tenantFor(scope, WRITE), id, [
        { categoryCode: 'MEN', headcount: 9 },
      ]),
  });
});

describe('DeleteAttendanceSession', () => {
  it('removes the session and audits the total it had', async () => {
    const { remove, repository, audit } = setup();
    const existing = repository.seed(1, 10, '2026-10-25', [3, 3, 3, 3, 3]);

    await remove.execute(tenantFor(TENANT_A, WRITE), existing.id);

    expect(repository.sessions).toHaveLength(0);
    expect(audit.last).toMatchObject({
      action: 'ATTENDANCE_DELETED',
      entityId: existing.id,
      changes: { total: { from: 15, to: null } },
    });
  });

  it('lets a denomination-wide role delete the session of any of its sedes', async () => {
    const { remove, repository } = setup();
    const existing = repository.seed(1, 11, '2026-10-25', [1, 0, 0, 0, 0]);

    await remove.execute(tenantFor(TENANT_A_WIDE, WRITE), existing.id);

    expect(repository.sessions).toHaveLength(0);
  });

  it('does not leave an audit trail when the session is not visible', async () => {
    const { remove, repository, audit } = setup();
    const existing = repository.seed(1, 10, '2026-10-25', [1, 0, 0, 0, 0]);

    await expect(
      remove.execute(tenantFor(TENANT_A_SIBLING, WRITE), existing.id),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    expect(repository.sessions).toHaveLength(1);
    expect(audit.entries).toHaveLength(0);
  });

  describeCrossTenantIsolation('DeleteAttendanceSession', {
    arrange: () => {
      const world = setup();
      current = world;
      return world.repository.seed(1, 10, '2026-10-25', [1, 1, 1, 1, 1]).id;
    },
    act: (scope: TenantScope, id: number) =>
      current.remove.execute(tenantFor(scope, WRITE), id),
  });
});
