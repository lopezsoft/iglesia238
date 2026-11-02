import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../core/demo/demo-fixtures';
import { AccountingDemoStore } from '../../accounting/data/accounting-demo-store';
import { DashboardSummary } from './dashboard.models';
import { DashboardRepository } from './dashboard.repository';
import { DemoDashboardRepository } from './demo-dashboard.repository';

const PLATFORM_ADMIN = 'laura.gomez@iglesia238.example';
const DENOMINATION_ADMIN = 'andres.molina@montedesion.example';
const PASTOR_CENTRAL = 'daniel.herrera@montedesion.example';
const SECRETARY_CENTRAL = 'marta.castillo@montedesion.example';
const TREASURER_CENTRAL = 'jorge.ramirez@montedesion.example';
const PASTOR_NORTE = 'luis.ortega@montedesion.example';
const ADMIN_DENOMINATION_2 = 'ricardo.leon@vidanueva.example';

async function summaryFor(
  email: string,
): Promise<{ summary: DashboardSummary; auth: AuthService }> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: DashboardRepository, useClass: DemoDashboardRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  const summary = await firstValueFrom(TestBed.inject(DashboardRepository).summary());
  return { summary, auth };
}

describe('DemoDashboardRepository', () => {
  it('gives a treasurer finance widgets and no membership or secretariat data', async () => {
    const { summary } = await summaryFor(TREASURER_CENTRAL);

    expect(summary.membership).toBeNull();
    expect(summary.pendingApplications).toBeNull();
    expect(summary.certificates).toBeNull();
    expect(summary.attendance).toBeNull();
    expect(summary.congregations).toBeNull();
    expect(summary.users).toBeNull();
    expect(summary.recentAudit).toBeNull();

    expect(summary.monthlyIncome).not.toBeNull();
    expect(summary.cashBook?.openPeriodLabel).toBe('Noviembre 2026');
    expect(summary.titheSettlement).toEqual({ lastSettledOn: '2026-10-05', daysSince: 28 });
  });

  it('gives a platform admin denominations, users and audit but no tenant or finance data', async () => {
    const { summary } = await summaryFor(PLATFORM_ADMIN);
    const db = TestBed.inject(DemoDatabase);

    expect(summary.denominations).toEqual({ active: 2, inactive: 1 });
    expect(summary.users?.active).toBe(
      db.users.filter((u) => u.isActive && !u.invitationPending).length,
    );
    const audit = summary.recentAudit ?? [];
    expect(audit).toHaveLength(5);
    expect(audit[0].createdAt >= audit[4].createdAt).toBe(true);

    expect(summary.monthlyIncome).toBeNull();
    expect(summary.cashBook).toBeNull();
    expect(summary.titheSettlement).toBeNull();
    expect(summary.membership).toBeNull();
    expect(summary.congregations).toBeNull();
  });

  it('gives a denomination admin every sede with its members and pending applications', async () => {
    const { summary } = await summaryFor(DENOMINATION_ADMIN);
    const db = TestBed.inject(DemoDatabase);

    expect(summary.congregations?.map((c) => c.id)).toEqual([1, 2, 3]);
    const central = summary.congregations!.find((c) => c.id === 1)!;
    expect(central.activeMembers).toBe(
      db.members.filter((m) => m.congregationId === 1 && m.status === 'ACTIVE').length,
    );
    expect(central.pendingApplications).toBe(6);
    expect(summary.users).not.toBeNull();
    expect(summary.membership).not.toBeNull();
    expect(summary.monthlyIncome).toBeNull();
    expect(summary.denominations).toBeNull();
  });

  it('lists the five newest unresolved applications of the pastor sede with the secretariat KPIs', async () => {
    const { summary } = await summaryFor(PASTOR_CENTRAL);

    expect(summary.pendingApplications?.total).toBe(6);
    expect(summary.pendingApplications?.items).toHaveLength(5);
    expect(
      summary.pendingApplications?.items.every((item) => item.congregationName === 'Sede Central'),
    ).toBe(true);
    expect(summary.pendingApplications?.items[0].id).toBe(6);
    expect(summary.certificates).toEqual({
      year: 2026,
      issuedThisYear: expect.any(Number),
      lastNumber: 'CERT-MEM-2026-0031',
    });
    expect(summary.cashBook).toBeNull();
    expect(summary.titheSettlement).toBeNull();
  });

  it('reports the last attendance session of the secretary sede', async () => {
    const { summary } = await summaryFor(SECRETARY_CENTRAL);

    expect(summary.attendance?.lastSession).toEqual({
      sessionDate: '2026-10-25',
      meetingTypeName: 'Escuela Dominical',
      congregationName: 'Sede Central',
      total: 45 + 28 + 60 + 46 + 8,
    });
    expect(summary.monthlyIncome).toBeNull();
  });

  it('computes the income of the month and the six-month trend from the recorded contributions', async () => {
    const { summary } = await summaryFor(PASTOR_CENTRAL);
    const store = TestBed.inject(AccountingDemoStore);
    const sum = (prefix: string): number =>
      store.contributions
        .filter(
          (c) =>
            c.congregationId === 1 && c.status === 'RECORDED' && c.receivedOn.startsWith(prefix),
        )
        .reduce((total, c) => total + c.amount, 0);

    const income = summary.monthlyIncome!;
    expect(income.monthLabel).toBe('Noviembre 2026');
    expect(income.total).toBe(sum('2026-11-'));
    expect(income.byCategory.reduce((total, c) => total + c.amount, 0)).toBe(income.total);
    expect(income.trend.map((m) => m.month)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(income.trend.find((m) => m.month === 10)?.total).toBe(sum('2026-10-'));
  });

  it('keeps every widget inside the active sede or denomination', async () => {
    const norte = await summaryFor(PASTOR_NORTE);
    expect(norte.summary.pendingApplications?.items.map((item) => item.id)).toEqual([10, 9]);
    expect(
      norte.summary.pendingApplications?.items.every(
        (item) => item.congregationName === 'Sede Norte',
      ),
    ).toBe(true);

    TestBed.resetTestingModule();
    const other = await summaryFor(ADMIN_DENOMINATION_2);
    const db = TestBed.inject(DemoDatabase);
    expect(other.summary.congregations?.map((c) => c.id)).toEqual([4, 5]);
    expect(other.summary.membership?.active).toBe(
      db.members.filter((m) => m.denominationId === 2 && m.status === 'ACTIVE').length,
    );
    expect(other.summary.denominationName).toBe('Comunidad Cristiana Vida Nueva');
  });

  it('keeps the money of a deactivated sede in the denomination-wide fund balance', async () => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthGateway, useClass: DemoAuthGateway },
        { provide: DashboardRepository, useClass: DemoDashboardRepository },
      ],
    });
    const db = TestBed.inject(DemoDatabase);
    const treasurer = db.users.find((u) => u.email === TREASURER_CENTRAL)!;
    // A denomination-wide treasurer (not in the fixtures) is the role that sees "Saldo en fondos".
    db.userRoles.push({
      id: db.nextId(db.userRoles),
      userId: treasurer.id,
      role: 'TREASURER',
      scope: 'DENOMINATION',
      denominationId: 1,
      congregationId: null,
      grantedById: 1,
      createdAt: '2026-10-01T12:00:00Z',
      revokedAt: null,
    });
    const auth = TestBed.inject(AuthService);
    await firstValueFrom(auth.login(TREASURER_CENTRAL, DEMO_PASSWORD));
    auth.selectScope(
      auth.user()!.selectableScopes.find((s) => s.kind === 'DENOMINATION' && s.denominationId === 1)!,
    );
    const repository = TestBed.inject(DashboardRepository);
    const before = (await firstValueFrom(repository.summary())).cashBook!;

    db.replace(db.congregations, { ...db.congregation(3)!, isActive: false });
    const after = (await firstValueFrom(repository.summary())).cashBook!;

    expect(after.totalBalance).toBe(before.totalBalance);
    expect(after.funds).toEqual(before.funds);
  });

  it('follows the scope selector:a denomination admin acting on one sede sees only that sede', async () => {
    const { auth } = await summaryFor(DENOMINATION_ADMIN);
    auth.selectScope(auth.user()!.selectableScopes.find((scope) => scope.congregationId === 2)!);

    const summary = await firstValueFrom(TestBed.inject(DashboardRepository).summary());
    expect(summary.congregations?.map((c) => c.id)).toEqual([2]);
  });
});
