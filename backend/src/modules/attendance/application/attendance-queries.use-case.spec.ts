import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../test/support/tenants.js';
import {
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { InMemoryAttendanceRepository } from '../testing/in-memory-attendance.repository.js';
import { FixedClock, tenantFor } from '../testing/test-doubles.js';
import { ExportAttendanceSessions } from './export-attendance-sessions.use-case.js';
import { GetAttendanceOptions } from './get-attendance-options.use-case.js';
import {
  FindAttendanceSessionByKey,
  GetAttendanceSession,
} from './get-attendance-session.use-case.js';
import { GetAttendanceStats } from './get-attendance-stats.use-case.js';
import { ListAttendanceSessions } from './list-attendance-sessions.use-case.js';

const WRITE = ['attendance.write'];
const clock = FixedClock.at('2026-11-02');

let repository: InMemoryAttendanceRepository;

beforeEach(() => {
  repository = new InMemoryAttendanceRepository();
});

describe('GetAttendanceOptions', () => {
  it('offers the sede of a sede role and every sede of a denomination role, never another denomination', async () => {
    const options = new GetAttendanceOptions(repository, clock);

    const sede = await options.execute(tenantFor(TENANT_A, WRITE));
    const wide = await options.execute(tenantFor(TENANT_A_WIDE, WRITE));
    const other = await options.execute(tenantFor(TENANT_B, WRITE));

    expect(sede.congregations.map((c) => c.id)).toEqual([10]);
    expect(wide.congregations.map((c) => c.id)).toEqual([10, 11]);
    expect(other.congregations.map((c) => c.id)).toEqual([20]);
    expect(sede).toMatchObject({ today: '2026-11-02', maxHeadcount: 2000 });
    expect(sede.categories).toHaveLength(5);
    expect(sede.meetingTypes.map((t) => t.code)).toContain('SUNDAY_SCHOOL');
  });
});

describe('ListAttendanceSessions', () => {
  beforeEach(() => {
    repository.seed(1, 10, '2026-10-04', [1, 1, 1, 1, 1]);
    repository.seed(1, 10, '2026-10-11', [2, 2, 2, 2, 2]);
    repository.seed(1, 10, '2026-10-18', [3, 3, 3, 3, 3], 'PRAYER_MEETING');
    repository.seed(1, 11, '2026-10-11', [4, 4, 4, 4, 4]);
    repository.seed(2, 20, '2026-10-11', [9, 9, 9, 9, 9]);
  });

  it('lists the most recent first with server-side paging', async () => {
    const list = new ListAttendanceSessions(repository);

    const first = await list.execute(tenantFor(TENANT_A, WRITE), {
      page: 1,
      pageSize: 2,
    });
    const second = await list.execute(tenantFor(TENANT_A, WRITE), {
      page: 2,
      pageSize: 2,
    });

    expect(first.total).toBe(3);
    expect(first.items.map((s) => s.sessionDate)).toEqual([
      '2026-10-18',
      '2026-10-11',
    ]);
    expect(second.items.map((s) => s.sessionDate)).toEqual(['2026-10-04']);
  });

  it('filters by meeting type and dates and never mixes denominations', async () => {
    const list = new ListAttendanceSessions(repository);

    const sundaySchool = await list.execute(tenantFor(TENANT_A_WIDE, WRITE), {
      page: 1,
      pageSize: 25,
      meetingTypeCode: 'SUNDAY_SCHOOL',
      from: '2026-10-10',
    });

    expect(
      sundaySchool.items.map((s) => [s.congregationId, s.sessionDate]),
    ).toEqual([
      [11, '2026-10-11'],
      [10, '2026-10-11'],
    ]);
    expect(sundaySchool.items.every((s) => s.denominationId === 1)).toBe(true);
  });

  it('rejects malformed or inverted date ranges', async () => {
    const list = new ListAttendanceSessions(repository);
    const tenant = tenantFor(TENANT_A, WRITE);

    await expect(
      list.execute(tenant, { page: 1, pageSize: 10, from: '25/10/2026' }),
    ).rejects.toBeInstanceOf(InvalidInputException);
    await expect(
      list.execute(tenant, {
        page: 1,
        pageSize: 10,
        from: '2026-10-10',
        to: '2026-10-01',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
  });

  describeCrossTenantIsolation('ListAttendanceSessions (by sede)', {
    arrange: () => 10,
    act: (scope: TenantScope, congregationId: number) =>
      new ListAttendanceSessions(repository).execute(tenantFor(scope, WRITE), {
        page: 1,
        pageSize: 10,
        congregationId,
      }),
  });
});

describe('GetAttendanceSession and FindAttendanceSessionByKey', () => {
  it('finds a session by id and by key inside the scope', async () => {
    const seeded = repository.seed(1, 10, '2026-10-25', [5, 5, 5, 5, 5]);

    const byId = await new GetAttendanceSession(repository).execute(
      tenantFor(TENANT_A, WRITE),
      seeded.id,
    );
    const byKey = await new FindAttendanceSessionByKey(repository).execute(
      tenantFor(TENANT_A, WRITE),
      {
        congregationId: 10,
        meetingTypeCode: 'SUNDAY_SCHOOL',
        sessionDate: '2026-10-25',
      },
    );

    expect(byId.id).toBe(seeded.id);
    expect(byKey.id).toBe(seeded.id);
  });

  it('answers SESSION_NOT_FOUND when the key has no session', async () => {
    await expect(
      new FindAttendanceSessionByKey(repository).execute(
        tenantFor(TENANT_A, WRITE),
        {
          congregationId: 10,
          meetingTypeCode: 'SUNDAY_SCHOOL',
          sessionDate: '2026-10-25',
        },
      ),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  describeCrossTenantIsolation('GetAttendanceSession', {
    arrange: () => repository.seed(1, 10, '2026-10-25', [1, 1, 1, 1, 1]).id,
    act: (scope: TenantScope, id: number) =>
      new GetAttendanceSession(repository).execute(tenantFor(scope, WRITE), id),
  });

  describeCrossTenantIsolation('FindAttendanceSessionByKey', {
    arrange: () => {
      repository.seed(1, 10, '2026-10-25', [1, 1, 1, 1, 1]);
      return 10;
    },
    act: (scope: TenantScope, congregationId: number) =>
      new FindAttendanceSessionByKey(repository).execute(
        tenantFor(scope, WRITE),
        {
          congregationId,
          meetingTypeCode: 'SUNDAY_SCHOOL',
          sessionDate: '2026-10-25',
        },
      ),
  });
});

describe('GetAttendanceStats', () => {
  beforeEach(() => {
    repository.seed(1, 10, '2025-09-07', [10, 0, 0, 0, 0]);
    repository.seed(1, 10, '2025-10-05', [20, 0, 0, 0, 0]);
    repository.seed(1, 10, '2026-09-06', [30, 0, 0, 0, 0]);
    repository.seed(1, 10, '2026-10-04', [10, 10, 0, 0, 0]);
    repository.seed(1, 10, '2026-10-11', [10, 30, 0, 0, 0]);
    repository.seed(1, 11, '2026-10-11', [100, 0, 0, 0, 0]);
    repository.seed(2, 20, '2026-10-11', [999, 0, 0, 0, 0]);
  });

  it('groups by month, finds the best session and compares the year with the previous one', async () => {
    const stats = await new GetAttendanceStats(repository, clock).execute(
      tenantFor(TENANT_A, WRITE),
      { groupBy: 'month', from: '2026-01-01' },
    );

    expect(stats.series.map((p) => [p.period, p.sessions, p.total])).toEqual([
      ['2026-09', 1, 30],
      ['2026-10', 2, 60],
    ]);
    expect(stats.series[1].byCategory).toMatchObject({
      CHILDREN: 20,
      TEENAGERS: 40,
    });
    expect(stats.sessionCount).toBe(3);
    expect(stats.average).toBe(30);
    expect(stats.max).toEqual({ sessionDate: '2026-10-11', total: 40 });
    expect(stats.yearOverYear).toEqual({
      year: 2026,
      previousYear: 2025,
      average: 30,
      previousAverage: 15,
      changePercent: 100,
    });
  });

  it('groups by year and never counts other sedes or denominations', async () => {
    const stats = await new GetAttendanceStats(repository, clock).execute(
      tenantFor(TENANT_A_WIDE, WRITE),
      { groupBy: 'year' },
    );

    expect(stats.series.map((p) => [p.period, p.total])).toEqual([
      ['2025', 30],
      ['2026', 190],
    ]);
  });

  it('has no comparison when the previous year is empty', async () => {
    const stats = await new GetAttendanceStats(repository, clock).execute(
      tenantFor(TENANT_B, WRITE),
      { groupBy: 'month' },
    );

    expect(stats.yearOverYear).toMatchObject({
      average: 999,
      previousAverage: null,
      changePercent: null,
    });
  });

  describeCrossTenantIsolation('GetAttendanceStats (by sede)', {
    arrange: () => 10,
    act: (scope: TenantScope, congregationId: number) =>
      new GetAttendanceStats(repository, clock).execute(
        tenantFor(scope, WRITE),
        {
          groupBy: 'month',
          congregationId,
        },
      ),
  });
});

describe('ExportAttendanceSessions', () => {
  it('exports a CSV with BOM, semicolons and the totals, oldest data last', async () => {
    repository.seed(1, 10, '2026-10-04', [1, 2, 3, 4, 5]);
    repository.seed(1, 10, '2026-10-11', [6, 0, 0, 0, 0]);
    repository.seed(1, 11, '2026-10-11', [7, 0, 0, 0, 0]);
    repository.seed(2, 20, '2026-10-11', [8, 0, 0, 0, 0]);

    const file = await new ExportAttendanceSessions(repository).execute(
      tenantFor(TENANT_A, WRITE),
      {
        meetingTypeCode: 'SUNDAY_SCHOOL',
      },
    );

    const lines = file.content.replace('﻿', '').trim().split('\r\n');
    expect(file.content.startsWith('﻿')).toBe(true);
    expect(file.fileName).toBe('asistencia-sunday_school.csv');
    expect(lines[0]).toBe(
      'Fecha;Sede;Reunión;Niños;Adolescentes;Hermanas;Hermanos;Visitas;Total;Registrado por',
    );
    expect(lines.slice(1)).toEqual([
      '2026-10-11;Sede Central;Escuela Dominical;6;0;0;0;0;6;Marta Castillo',
      '2026-10-04;Sede Central;Escuela Dominical;1;2;3;4;5;15;Marta Castillo',
    ]);
  });

  it('never puts quotes, line breaks or other free text of the filter in the file name', async () => {
    const file = await new ExportAttendanceSessions(repository).execute(
      tenantFor(TENANT_A, WRITE),
      { meetingTypeCode: "x\";\r\nfilename*=UTF-8''a.exe" },
    );

    expect(file.fileName).toMatch(/^asistencia-[a-z0-9_]+\.csv$/);
    expect(file.fileName).not.toMatch(/["\r\n;*']/);
    const none = await new ExportAttendanceSessions(repository).execute(
      tenantFor(TENANT_A, WRITE),
      { meetingTypeCode: '";' },
    );
    expect(none.fileName).toBe('asistencia-todas.csv');
  });

  describeCrossTenantIsolation('ExportAttendanceSessions (by sede)', {
    arrange: () => 10,
    act: (scope: TenantScope, congregationId: number) =>
      new ExportAttendanceSessions(repository).execute(
        tenantFor(scope, WRITE),
        { congregationId },
      ),
  });

  it('does not let a sibling sede export the sede of another', async () => {
    await expect(
      new ExportAttendanceSessions(repository).execute(
        tenantFor(TENANT_A_SIBLING, WRITE),
        {
          congregationId: 10,
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
  });
});
