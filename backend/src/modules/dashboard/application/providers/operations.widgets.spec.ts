import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { buildPeriodWindow } from '../period-window.js';
import type { DashboardContext } from '../dashboard.types.js';
import type {
  DashboardOperationsReader,
  LatestAttendance,
} from '../ports/dashboard-operations.reader.js';
import type { StatsScope } from '../ports/dashboard-stats.reader.js';
import {
  ApplicationsWidgets,
  AttendanceWidgets,
  CertificatesWidgets,
  CongregationsWidgets,
  MembersWidgets,
} from './operations.widgets.js';

/** Counts per denomination, so a scope that leaks would show another denomination's figures. */
const MEMBERS_BY_DENOMINATION: Record<number, number> = { 1: 12, 2: 900 };

class FakeOperations implements DashboardOperationsReader {
  readonly scopes: StatsScope[] = [];
  latest: LatestAttendance | null = null;

  countMembers(scope: StatsScope) {
    this.scopes.push(scope);
    return Promise.resolve({
      active: MEMBERS_BY_DENOMINATION[scope.denominationId ?? 0] ?? 0,
      joinedInRange: 3,
      joinedInPrevious: 1,
    });
  }

  countOpenApplications(scope: StatsScope) {
    this.scopes.push(scope);
    return Promise.resolve(scope.denominationId === 1 ? 4 : 0);
  }

  countCertificatesIssued(scope: StatsScope, range: { from: string }) {
    this.scopes.push(scope);
    return Promise.resolve(range.from === '2026-11-02' ? 5 : 2);
  }

  countCardsExpiring(scope: StatsScope) {
    this.scopes.push(scope);
    return Promise.resolve(3);
  }

  countAttendanceSessions(scope: StatsScope) {
    this.scopes.push(scope);
    return Promise.resolve(2);
  }

  latestAttendance(scope: StatsScope) {
    this.scopes.push(scope);
    return Promise.resolve(this.latest);
  }
}

const contextOf = (
  tenant: ReturnType<typeof buildTenantContext>,
): DashboardContext => ({
  tenant,
  window: buildPeriodWindow('today', '2026-11-02'),
});

const sedeOne = buildTenantContext({ kind: 'CONGREGATION' });
const denominationTwo = buildTenantContext({
  kind: 'DENOMINATION',
  denominationId: 2,
});

describe('MembersWidgets', () => {
  it('counts only the members of the scope it is given', async () => {
    const operations = new FakeOperations();
    const widgets = new MembersWidgets(operations);

    const mine = await widgets.provide(contextOf(sedeOne));
    const other = await widgets.provide(contextOf(denominationTwo));

    expect(mine.hero?.value).toBe(12);
    expect(other.hero?.value).toBe(900);
    expect(mine.kpis?.[0]).toMatchObject({ value: 3, previous: 1 });
    expect(operations.scopes).toEqual([
      { denominationId: 1, congregationId: 10 },
      { denominationId: 2, congregationId: null },
    ]);
  });

  it('needs members.read and never applies to the platform', () => {
    const widgets = new MembersWidgets(new FakeOperations());

    expect(widgets.requiredPermissions).toEqual(['members.read']);
    expect(widgets.scopeKinds).not.toContain('PLATFORM');
  });
});

describe('ApplicationsWidgets', () => {
  it('warns when applications wait and stays quiet when none do', async () => {
    const widgets = new ApplicationsWidgets(new FakeOperations());

    const waiting = await widgets.provide(contextOf(sedeOne));
    const none = await widgets.provide(contextOf(denominationTwo));

    expect(waiting.kpis?.[0]).toMatchObject({ value: 4, tone: 'orange' });
    expect(none.kpis?.[0]).toMatchObject({ value: 0, tone: 'slate' });
    expect(widgets.requiredPermissions).toEqual(['applications.review']);
  });
});

describe('CertificatesWidgets', () => {
  it('reports the certificates of the period against the previous one and the cards about to expire', async () => {
    const widgets = new CertificatesWidgets(new FakeOperations());

    const { kpis } = await widgets.provide(contextOf(sedeOne));

    expect(kpis?.[0]).toMatchObject({ value: 5, previous: 2 });
    expect(kpis?.[1]).toMatchObject({ value: 3, tone: 'orange' });
  });
});

describe('AttendanceWidgets', () => {
  it('says so when no attendance was ever recorded', async () => {
    const widgets = new AttendanceWidgets(new FakeOperations());

    const { kpis } = await widgets.provide(contextOf(sedeOne));

    expect(kpis?.[0]).toMatchObject({
      value: 'Sin registros',
      format: 'text',
    });
  });

  it('shows the headcount of the latest session', async () => {
    const operations = new FakeOperations();
    operations.latest = {
      sessionDate: '2026-11-01',
      meetingTypeName: 'Escuela Dominical',
      headcount: 87,
    };

    const { kpis } = await new AttendanceWidgets(operations).provide(
      contextOf(sedeOne),
    );

    expect(kpis?.[0]).toMatchObject({
      value: 87,
      hint: 'Escuela Dominical · 2026-11-01',
    });
  });
});

describe('CongregationsWidgets', () => {
  it('counts the active sedes of the denomination in scope', async () => {
    const scopes: StatsScope[] = [];
    const widgets = new CongregationsWidgets({
      countActiveCongregations: (scope: StatsScope) => {
        scopes.push(scope);
        return Promise.resolve(6);
      },
    } as never);

    const { kpis } = await widgets.provide(contextOf(denominationTwo));

    expect(kpis?.[0]).toMatchObject({ value: 6, link: '/organization' });
    expect(scopes).toEqual([{ denominationId: 2, congregationId: null }]);
    expect(widgets.scopeKinds).toEqual(['DENOMINATION']);
  });
});
