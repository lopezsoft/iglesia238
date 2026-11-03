import {
  BusinessRuleException,
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../test/support/tenants.js';
import { InMemoryAttendanceRepository } from '../testing/in-memory-attendance.repository.js';
import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
  tenantFor,
} from '../testing/test-doubles.js';
import type { AttendanceCountRecord } from './attendance.models.js';
import { RecordAttendanceSession } from './record-attendance-session.use-case.js';

const WRITE = ['attendance.write'];

function counts(...headcounts: number[]): AttendanceCountRecord[] {
  return ['CHILDREN', 'TEENAGERS', 'WOMEN', 'MEN', 'VISITORS'].map(
    (categoryCode, index) => ({
      categoryCode,
      headcount: headcounts[index] ?? 0,
    }),
  );
}

function setup() {
  const repository = new InMemoryAttendanceRepository();
  const audit = new FakeAuditRecorder();
  const transactions = new FakeTransactionRunner();
  const useCase = new RecordAttendanceSession(
    repository,
    transactions,
    audit,
    FixedClock.at('2026-11-02'),
  );
  return { repository, audit, transactions, useCase };
}

const command = {
  congregationId: 10,
  meetingTypeCode: 'SUNDAY_SCHOOL',
  sessionDate: '2026-11-01',
  attendanceCounts: counts(40, 20, 50, 40, 5),
};

describe('RecordAttendanceSession', () => {
  it('records the session, stamps who recorded it and audits only the total', async () => {
    const { useCase, audit, transactions } = setup();

    const session = await useCase.execute(
      tenantFor(TENANT_A, WRITE, 7),
      command,
    );

    expect(session.total).toBe(155);
    expect(session.attendanceCounts).toHaveLength(5);
    expect(session.recordedBy).toBe('Usuario 7');
    expect(transactions.runs).toBe(1);
    expect(audit.last).toMatchObject({
      action: 'ATTENDANCE_RECORDED',
      entity: 'AttendanceSession',
      entityId: session.id,
      congregationId: 10,
      changes: { total: { from: null, to: 155 } },
    });
  });

  it('lets a denomination-wide role record in any sede of its denomination', async () => {
    const { useCase } = setup();

    const session = await useCase.execute(tenantFor(TENANT_A_WIDE, WRITE), {
      ...command,
      congregationId: 11,
    });

    expect(session.congregationId).toBe(11);
    expect(session.congregationName).toBe('Sede Norte');
  });

  it('answers 409 DUPLICATE_SESSION for the same sede, meeting type and date, but not for another sede', async () => {
    const { useCase } = setup();
    const tenant = tenantFor(TENANT_A_WIDE, WRITE);
    await useCase.execute(tenant, command);

    const duplicate = useCase.execute(tenant, command);
    await expect(duplicate).rejects.toBeInstanceOf(ConflictDomainException);
    await expect(duplicate).rejects.toMatchObject({
      code: 'DUPLICATE_SESSION',
    });
    await expect(
      useCase.execute(tenant, { ...command, congregationId: 11 }),
    ).resolves.toMatchObject({ congregationId: 11 });
  });

  it('completes missing categories with 0 and rejects an empty session', async () => {
    const { useCase } = setup();
    const tenant = tenantFor(TENANT_A, WRITE);

    const session = await useCase.execute(tenant, {
      ...command,
      attendanceCounts: [{ categoryCode: 'MEN', headcount: 3 }],
    });
    expect(session.attendanceCounts.map((c) => c.headcount)).toEqual([
      0, 0, 0, 3, 0,
    ]);

    await expect(
      useCase.execute(tenant, {
        ...command,
        sessionDate: '2026-10-25',
        attendanceCounts: counts(),
      }),
    ).rejects.toMatchObject({ code: 'EMPTY_SESSION' });
  });

  it.each([
    ['negative', -1],
    ['decimal', 2.5],
    ['over the limit', 2001],
  ])('rejects a %s headcount', async (_label, headcount) => {
    const { useCase } = setup();

    await expect(
      useCase.execute(tenantFor(TENANT_A, WRITE), {
        ...command,
        attendanceCounts: [{ categoryCode: 'MEN', headcount }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_HEADCOUNT' });
  });

  it('rejects unknown or repeated categories', async () => {
    const { useCase } = setup();
    const tenant = tenantFor(TENANT_A, WRITE);

    await expect(
      useCase.execute(tenant, {
        ...command,
        attendanceCounts: [{ categoryCode: 'ELDERS', headcount: 3 }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });
    await expect(
      useCase.execute(tenant, {
        ...command,
        attendanceCounts: [
          { categoryCode: 'MEN', headcount: 3 },
          { categoryCode: 'MEN', headcount: 4 },
        ],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CATEGORY' });
  });

  it('rejects future dates (Bogota time), impossible dates and unknown meeting types', async () => {
    const { useCase } = setup();
    const tenant = tenantFor(TENANT_A, WRITE);

    await expect(
      useCase.execute(tenant, { ...command, sessionDate: '2026-11-03' }),
    ).rejects.toMatchObject({ code: 'INVALID_DATE' });
    await expect(
      useCase.execute(tenant, { ...command, sessionDate: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
    await expect(
      useCase.execute(tenant, { ...command, sessionDate: '2026-11-02' }),
    ).resolves.toMatchObject({ sessionDate: '2026-11-02' });
    await expect(
      useCase.execute(tenant, { ...command, meetingTypeCode: 'BINGO' }),
    ).rejects.toMatchObject({ code: 'INVALID_MEETING_TYPE' });
  });

  it('does not write or audit anything when the request is rejected', async () => {
    const { useCase, repository, audit } = setup();

    await expect(
      useCase.execute(tenantFor(TENANT_A, WRITE), {
        ...command,
        attendanceCounts: counts(),
      }),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    expect(repository.sessions).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });

  describeCrossTenantIsolation('RecordAttendanceSession', {
    arrange: () => 10,
    act: (scope: TenantScope, congregationId: number) =>
      setup().useCase.execute(tenantFor(scope, WRITE), {
        ...command,
        congregationId,
      }),
  });

  it('never creates a session in a sede of another denomination', async () => {
    const { useCase, repository } = setup();

    await expect(
      useCase.execute(tenantFor(TENANT_A_WIDE, WRITE), {
        ...command,
        congregationId: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    await expect(
      useCase.execute(tenantFor(TENANT_B, WRITE), {
        ...command,
        congregationId: 10,
      }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(repository.sessions).toHaveLength(0);
  });
});
