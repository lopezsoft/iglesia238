import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { buildPeriodWindow } from '../period-window.js';
import type { DashboardContext } from '../dashboard.types.js';
import type {
  AuditActivityReader,
  DashboardStatsReader,
  RecentAuditRow,
  StatsScope,
  UserCounts,
} from '../ports/dashboard-stats.reader.js';
import { ActivityWidgets, RecentAuditWidgets } from './audit.widgets.js';
import {
  PlatformOverviewWidgets,
  PlatformSecurityWidgets,
} from './platform.widgets.js';
import { UsersOverviewWidgets } from './users.widgets.js';

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-11-02T15:00:00.000Z');
  }
}

/** Users per denomination, so a scope that leaks would show another denomination's numbers. */
const USERS_BY_DENOMINATION: Record<number, UserCounts> = {
  1: { active: 7, pendingInvitations: 1 },
  2: { active: 100, pendingInvitations: 50 },
};

class FakeStats implements DashboardStatsReader {
  readonly scopes: StatsScope[] = [];

  countDenominations() {
    return Promise.resolve({ active: 3, inactive: 1 });
  }

  countActiveCongregations() {
    return Promise.resolve(9);
  }

  countUsers(scope: StatsScope) {
    this.scopes.push(scope);
    if (scope.denominationId === null) {
      return Promise.resolve({ active: 107, pendingInvitations: 51 });
    }
    return Promise.resolve(USERS_BY_DENOMINATION[scope.denominationId]);
  }

  countLockedAccounts() {
    return Promise.resolve(2);
  }
}

const RECENT: RecentAuditRow[] = [
  {
    id: 12,
    createdAt: new Date('2026-11-02T14:00:00.000Z'),
    action: 'CERTIFICATE_ISSUED',
    entity: 'Certificate',
    userName: 'Laura Gómez',
    scopeLabel: 'Sede Norte',
  },
];

class FakeAudit implements AuditActivityReader {
  readonly scopes: StatsScope[] = [];

  countEvents(scope: StatsScope, range: { from: string }, action?: string) {
    this.scopes.push(scope);
    if (action === 'LOGIN_FAILED') return Promise.resolve(4);
    if (action === 'LOGIN') return Promise.resolve(30);
    return Promise.resolve(range.from === '2026-11-02' ? 12 : 8);
  }

  eventsPerDay(_scope: StatsScope, days: readonly string[]) {
    return Promise.resolve(days.map((_, index) => index));
  }

  eventsPerMonth(_scope: StatsScope, months: readonly string[]) {
    return Promise.resolve(months.map((_, index) => index * 10));
  }

  recent(scope: StatsScope) {
    this.scopes.push(scope);
    return Promise.resolve(RECENT);
  }
}

const contextOf = (
  tenant = buildTenantContext({ kind: 'PLATFORM' }),
): DashboardContext => ({
  tenant,
  window: buildPeriodWindow('today', '2026-11-02'),
});

describe('PlatformOverviewWidgets', () => {
  it('counts denominations and congregations, in the platform scope only', async () => {
    const widgets = new PlatformOverviewWidgets(new FakeStats());

    const { kpis } = await widgets.provide();

    expect(widgets.scopeKinds).toEqual(['PLATFORM']);
    expect(widgets.requiredPermissions).toEqual(['denominations.manage']);
    expect(kpis?.[0]).toMatchObject({
      value: 3,
      hint: '1 inactiva',
      link: '/denominations',
    });
    expect(kpis?.[1]).toMatchObject({ key: 'congregations', value: 9 });
  });
});

describe('PlatformSecurityWidgets', () => {
  it('reports sign-ins, failures, locked accounts and pending invitations', async () => {
    const widgets = new PlatformSecurityWidgets(
      new FakeStats(),
      new FakeAudit(),
      new FixedClock(),
    );

    const { panels } = await widgets.provide(contextOf());

    const values = Object.fromEntries(
      panels?.[0].stats.map((s) => [s.key, s.value]) ?? [],
    );
    expect(values).toEqual({
      'sign-ins': 30,
      'failed-sign-ins': 4,
      'locked-accounts': 2,
      'pending-invitations': 51,
    });
    expect(panels?.[0].tab).toBe('indicators');
  });
});

describe('UsersOverviewWidgets', () => {
  it('counts the users of the scope it is given and nobody else', async () => {
    const stats = new FakeStats();
    const widgets = new UsersOverviewWidgets(stats);

    const mine = await widgets.provide(
      contextOf(
        buildTenantContext({ kind: 'DENOMINATION', denominationId: 1 }),
      ),
    );
    const other = await widgets.provide(
      contextOf(
        buildTenantContext({ kind: 'DENOMINATION', denominationId: 2 }),
      ),
    );

    expect(mine.kpis?.[0]).toMatchObject({
      value: 7,
      hint: '1 invitación pendiente',
    });
    expect(other.kpis?.[0]).toMatchObject({
      value: 100,
      hint: '50 invitaciones pendientes',
    });
    expect(stats.scopes).toEqual([
      { denominationId: 1, congregationId: null },
      { denominationId: 2, congregationId: null },
    ]);
  });

  it('applies to every scope but only with users.manage', () => {
    const widgets = new UsersOverviewWidgets(new FakeStats());

    expect(widgets.scopeKinds).toEqual([
      'PLATFORM',
      'DENOMINATION',
      'CONGREGATION',
    ]);
    expect(widgets.requiredPermissions).toEqual(['users.manage']);
  });
});

describe('ActivityWidgets', () => {
  it('builds the hero with the comparison and the daily series', async () => {
    const widgets = new ActivityWidgets(new FakeAudit());

    const { hero, trends } = await widgets.provide(contextOf());

    expect(hero).toMatchObject({
      key: 'activity',
      value: 12,
      previous: 8,
      format: 'integer',
      label: 'Eventos registrados · Hoy',
    });
    expect(hero?.series).toHaveLength(7);
    expect(trends?.[0].points).toHaveLength(6);
    expect(trends?.[0].points.at(-1)).toEqual({ label: 'Nov', value: 50 });
  });

  it('draws no sparkline when nothing happened in the days of the series', async () => {
    const audit = new FakeAudit();
    audit.eventsPerDay = (_scope, days) => Promise.resolve(days.map(() => 0));

    const { hero } = await new ActivityWidgets(audit).provide(contextOf());

    expect(hero?.series).toEqual([]);
  });

  it('reads the audit of the scope of the request, never wider', async () => {
    const audit = new FakeAudit();

    await new ActivityWidgets(audit).provide(
      contextOf(buildTenantContext({ kind: 'CONGREGATION' })),
    );

    expect(
      audit.scopes.every(
        (s) => s.denominationId === 1 && s.congregationId === 10,
      ),
    ).toBe(true);
  });
});

describe('RecentAuditWidgets', () => {
  it('writes each entry in Spanish and keeps personal data out', async () => {
    const { lists } = await new RecentAuditWidgets(new FakeAudit()).provide(
      contextOf(),
    );

    expect(lists?.[0].items[0]).toEqual({
      id: '12',
      title: 'Emisión de certificado · Certificado',
      subtitle: 'Laura Gómez · Sede Norte',
      occurredAt: '2026-11-02T14:00:00.000Z',
      badge: null,
    });
  });

  it('reads only the entries of the denomination in scope', async () => {
    const audit = new FakeAudit();

    await new RecentAuditWidgets(audit).provide(
      contextOf(
        buildTenantContext({ kind: 'DENOMINATION', denominationId: 2 }),
      ),
    );

    expect(audit.scopes).toEqual([{ denominationId: 2, congregationId: null }]);
  });
});
