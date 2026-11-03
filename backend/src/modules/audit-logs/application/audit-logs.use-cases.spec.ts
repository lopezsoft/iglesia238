import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { FixedClock } from '../../../../test/support/foundation-fakes.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import type {
  AuditLogReader,
  AuditRow,
  AuditScope,
  AuditSearch,
  AuditUserRef,
} from './audit-logs.ports.js';
import {
  GetAuditFilterOptionsUseCase,
  ListAuditLogsUseCase,
  type AuditQueryInput,
} from './audit-logs.use-cases.js';
import { formatChanges, maskIpAddress } from './audit-presentation.js';

class FakeAuditLogReader implements AuditLogReader {
  rows: AuditRow[] = [];
  users = new Map<number, AuditUserRef>();
  congregations = new Map<number, string>([[10, 'Sede Central']]);
  lastSearch: AuditSearch | null = null;
  lastSince: Date | null = null;

  add(values: Partial<AuditRow> = {}): AuditRow {
    const row: AuditRow = {
      id: this.rows.length + 1,
      createdAt: new Date('2026-11-01T15:00:00.000Z'),
      userId: 1,
      action: 'UPDATE',
      entity: 'Congregation',
      entityId: '5',
      denominationId: 1,
      congregationId: null,
      changes: null,
      ipAddress: '181.52.10.24',
      ...values,
    };
    this.rows.push(row);
    return row;
  }

  private inScope(scope: AuditScope, row: AuditRow): boolean {
    return (
      (scope.denominationId === null ||
        row.denominationId === scope.denominationId) &&
      (scope.congregationId === null ||
        row.congregationId === scope.congregationId)
    );
  }

  search(scope: AuditScope, search: AuditSearch) {
    this.lastSearch = search;
    const rows = this.rows
      .filter((row) => this.inScope(scope, row))
      .filter((row) => search.userId === null || row.userId === search.userId)
      .filter((row) => !search.action || row.action === search.action)
      .filter((row) => !search.from || row.createdAt >= search.from)
      .filter((row) => !search.to || row.createdAt <= search.to)
      .sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id,
      );
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
    }
    const start = (search.page - 1) * search.pageSize;
    return Promise.resolve({
      rows: rows.slice(start, start + search.pageSize),
      total: rows.length,
      actionCounts: counts,
    });
  }

  findUsers(ids: readonly number[]) {
    return Promise.resolve(
      new Map([...this.users].filter(([id]) => ids.includes(id))),
    );
  }

  findCongregationNames(ids: readonly number[]) {
    return Promise.resolve(
      new Map([...this.congregations].filter(([id]) => ids.includes(id))),
    );
  }

  findFilterValues(scope: AuditScope, since: Date) {
    this.lastSince = since;
    const rows = this.rows.filter((row) => this.inScope(scope, row));
    return Promise.resolve({
      userIds: [
        ...new Set(rows.flatMap((r) => (r.userId === null ? [] : [r.userId]))),
      ],
      actions: [...new Set(rows.map((r) => r.action))],
      entities: [...new Set(rows.map((r) => r.entity))],
    });
  }
}

const platform = buildTenantContext({
  kind: 'PLATFORM',
  permissions: ['audit-logs.read'],
});
const admin1 = buildTenantContext({
  kind: 'DENOMINATION',
  denominationId: 1,
  permissions: ['audit-logs.read'],
});
const admin1InSede = buildTenantContext({
  kind: 'CONGREGATION',
  denominationId: 1,
  congregationId: 10,
  permissions: ['audit-logs.read'],
});
const admin2 = buildTenantContext({
  kind: 'DENOMINATION',
  denominationId: 2,
  permissions: ['audit-logs.read'],
});

const noFilters: AuditQueryInput = {
  from: null,
  to: null,
  userId: null,
  action: null,
  entity: null,
  page: 1,
  pageSize: 20,
};

function build() {
  const reader = new FakeAuditLogReader();
  reader.users.set(1, { name: 'Andrés Admin', isPlatformAdmin: false });
  reader.users.set(2, { name: 'Equipo Uno', isPlatformAdmin: true });
  return {
    reader,
    list: new ListAuditLogsUseCase(reader),
    options: new GetAuditFilterOptionsUseCase(reader, new FixedClock()),
  };
}

describe('ListAuditLogsUseCase: tenant isolation', () => {
  it('shows the platform everything', async () => {
    const { list, reader } = build();
    reader.add({ denominationId: 1 });
    reader.add({ denominationId: 2 });
    reader.add({ denominationId: null, entity: 'Denomination' });

    expect((await list.execute(platform, noFilters)).total).toBe(3);
  });

  it('shows a denomination only its own entries', async () => {
    const { list, reader } = build();
    reader.add({ denominationId: 1 });
    reader.add({ denominationId: 2 });
    reader.add({ denominationId: null });

    const page = await list.execute(admin1, noFilters);
    const other = await list.execute(admin2, noFilters);

    expect(page.items.map((row) => row.id)).toEqual([1]);
    expect(other.items.map((row) => row.id)).toEqual([2]);
  });

  it('limits a session on a sede to that sede', async () => {
    const { list, reader } = build();
    reader.add({ denominationId: 1, congregationId: 10 });
    reader.add({ denominationId: 1, congregationId: 11 });
    reader.add({ denominationId: 1, congregationId: null });

    const page = await list.execute(admin1InSede, noFilters);

    expect(page.items.map((row) => row.id)).toEqual([1]);
    expect(page.items[0].scopeLabel).toBe('Sede Central');
  });
});

describe('ListAuditLogsUseCase: presentation', () => {
  it('orders the newest first, masks the address, formats changes and names the scope and the author', async () => {
    const { list, reader } = build();
    reader.add({
      createdAt: new Date('2026-11-01T10:00:00.000Z'),
      changes: {
        isActive: { from: true, to: false },
        name: { from: 'A', to: null },
      },
    });
    reader.add({
      createdAt: new Date('2026-11-01T12:00:00.000Z'),
      userId: null,
      ipAddress: null,
    });

    const page = await list.execute(admin1, noFilters);

    expect(page.items.map((row) => row.id)).toEqual([2, 1]);
    expect(page.items[0]).toMatchObject({
      userName: 'Sistema',
      ipAddress: '—',
      scopeLabel: 'Toda la denominación',
    });
    expect(page.items[1]).toMatchObject({
      userName: 'Andrés Admin',
      ipAddress: '181.52.•••.•••',
      createdAt: '2026-11-01T10:00:00.000Z',
      changes: [
        { field: 'isActive', from: 'Sí', to: 'No' },
        { field: 'name', from: 'A', to: '—' },
      ],
    });
  });

  it('labels platform entries and hides the platform team names from a denomination', async () => {
    const { list, reader } = build();
    reader.add({ userId: 2, denominationId: 1 });
    reader.add({ userId: 2, denominationId: null, entity: 'Denomination' });

    const seenByDenomination = await list.execute(admin1, noFilters);
    const seenByPlatform = await list.execute(platform, noFilters);

    expect(seenByDenomination.items[0].userName).toBe('Equipo de plataforma');
    expect(seenByPlatform.items.map((row) => row.userName)).toEqual([
      'Equipo Uno',
      'Equipo Uno',
    ]);
    expect(
      seenByPlatform.items.some((row) => row.scopeLabel === 'Plataforma'),
    ).toBe(true);
  });

  it('summarizes the whole filtered result, not only the page', async () => {
    const { list, reader } = build();
    reader.add({ action: 'ROLE_GRANTED' });
    reader.add({ action: 'ROLE_REVOKED' });
    reader.add({ action: 'USER_INVITED' });
    reader.add({ action: 'CONTRIBUTION_VOIDED' });
    reader.add({ action: 'PERIOD_CLOSED' });
    reader.add({ action: 'PERIOD_CLOSED' });

    const page = await list.execute(admin1, { ...noFilters, pageSize: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.summary).toEqual({
      total: 6,
      roleChanges: 3,
      contributionVoids: 1,
      periodClosures: 2,
    });
  });

  it('paginates and passes the filters to the reader', async () => {
    const { list, reader } = build();
    for (let index = 0; index < 5; index += 1) {
      reader.add({ action: 'ROLE_GRANTED', userId: 1 });
    }

    const page = await list.execute(admin1, {
      ...noFilters,
      page: 2,
      pageSize: 2,
      userId: 1,
      action: 'ROLE_GRANTED',
    });

    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(page.items).toHaveLength(2);
    expect(reader.lastSearch).toMatchObject({
      userId: 1,
      action: 'ROLE_GRANTED',
    });
  });
});

describe('ListAuditLogsUseCase: date range', () => {
  it('reads each day in Bogota time, inclusive of both ends', async () => {
    const { list, reader } = build();

    await list.execute(admin1, {
      ...noFilters,
      from: '2026-11-01',
      to: '2026-11-02',
    });

    expect(reader.lastSearch?.from?.toISOString()).toBe(
      '2026-11-01T05:00:00.000Z',
    );
    expect(reader.lastSearch?.to?.toISOString()).toBe(
      '2026-11-03T04:59:59.999Z',
    );
  });

  it('rejects an inverted range, an invalid date and a range longer than 90 days', async () => {
    const { list } = build();

    await expect(
      list.execute(admin1, {
        ...noFilters,
        from: '2026-11-05',
        to: '2026-11-01',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    await expect(
      list.execute(admin1, { ...noFilters, from: '2026-02-30' }),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
    await expect(
      list.execute(admin1, {
        ...noFilters,
        from: '2026-01-01',
        to: '2026-06-01',
      }),
    ).rejects.toMatchObject({ code: 'RANGE_TOO_LONG' });
    await expect(
      list.execute(admin1, { ...noFilters, from: '2026-02-30' }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });

  it('accepts exactly 90 days and a single open end', async () => {
    const { list } = build();

    await expect(
      list.execute(admin1, {
        ...noFilters,
        from: '2026-01-01',
        to: '2026-03-31',
      }),
    ).resolves.toBeDefined();
    await expect(
      list.execute(admin1, { ...noFilters, from: '2020-01-01' }),
    ).resolves.toBeDefined();
  });
});

describe('GetAuditFilterOptionsUseCase', () => {
  it('offers only values seen inside the scope, with users sorted by name, from the last 180 days', async () => {
    const { options, reader } = build();
    reader.add({
      userId: 1,
      action: 'ROLE_GRANTED',
      entity: 'UserRole',
      denominationId: 1,
    });
    reader.add({
      userId: 2,
      action: 'DEACTIVATE',
      entity: 'Denomination',
      denominationId: 2,
    });

    const forDenomination = await options.execute(admin1);
    const forPlatform = await options.execute(platform);

    expect(forDenomination).toEqual({
      users: [{ id: 1, name: 'Andrés Admin' }],
      actions: ['ROLE_GRANTED'],
      entities: ['UserRole'],
    });
    expect(forPlatform.users.map((user) => user.name)).toEqual([
      'Andrés Admin',
      'Equipo Uno',
    ]);
    expect(forPlatform.actions).toEqual(['DEACTIVATE', 'ROLE_GRANTED']);
    expect(reader.lastSince?.toISOString()).toBe('2026-05-06T15:00:00.000Z');
  });
});

describe('maskIpAddress', () => {
  it.each([
    ['181.52.10.24', '181.52.•••.•••'],
    ['::ffff:181.52.10.24', '181.52.•••.•••'],
    ['2800:484:1234:5678::1', '2800:484:••••'],
    ['::1', '•••'],
    ['not-an-ip', '•••'],
    [null, '—'],
  ])('shows %s as %s', (ip, expected) => {
    expect(maskIpAddress(ip)).toBe(expected);
  });
});

describe('formatChanges', () => {
  it('survives empty and malformed JSON', () => {
    expect(formatChanges(null)).toEqual([]);
    expect(formatChanges([1, 2])).toEqual([]);
    expect(formatChanges({ a: 'solo' })).toEqual([
      { field: 'a', from: '—', to: '—' },
    ]);
  });
});
