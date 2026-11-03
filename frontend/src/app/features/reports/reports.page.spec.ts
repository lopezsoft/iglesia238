import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../core/auth/auth.gateway';
import { AuthService } from '../../core/auth/auth.service';
import { Permission } from '../../core/auth/permission';
import { Scope, SessionUser } from '../../core/auth/session.model';
import { DomainError } from '../../core/errors/domain-error';
import { FileDownloadService } from '../../shared/utils/file-download.service';
import { FinancialReport, ReportOptions, ReportQuery } from './data/reports.models';
import { ReportsRepository } from './data/reports.repository';
import { ReportsPage } from './reports.page';

const sede: Scope = { kind: 'CONGREGATION', denominationId: 1, congregationId: 10, label: 'Sede Central' };

function sessionWith(permissions: Permission[]): SessionUser {
  return {
    id: 1,
    displayName: 'Jorge Ramírez',
    email: 'jorge@iglesia.example',
    emailVerified: true,
    assignments: [{ role: 'TREASURER', roleName: 'Tesorero', permissions, scope: sede }],
    selectableScopes: [sede],
  };
}

class FakeAuthGateway extends AuthGateway {
  permissions: Permission[] = ['reports.read', 'contributions.write'];
  login(): Observable<SessionUser> {
    return of(sessionWith(this.permissions));
  }
  restore(): Observable<SessionUser | null> {
    return of(null);
  }
  logout(): Observable<void> {
    return of(undefined);
  }
  requestPasswordReset(): Observable<void> {
    return of(undefined);
  }
  confirmPasswordReset(): Observable<void> {
    return of(undefined);
  }
  getInvitation(): Observable<InvitationInfo> {
    return of({ email: 'x@y.z', displayName: null, expiresAt: null });
  }
  acceptInvitation(): Observable<void> {
    return of(undefined);
  }
  confirmEmail = () => of(undefined);
  resendEmailVerification = () => of({ devVerificationLink: null });
  changePassword(): Observable<void> {
    return of(undefined);
  }
}

const OPTIONS: ReportOptions = {
  scopeLabel: 'Sede Central',
  denominationWide: false,
  funds: [{ id: 1, name: 'Fondo Local', isActive: true }],
  congregations: [],
  today: '2026-11-02',
};

const REPORT: FinancialReport = {
  query: { from: '2026-01-01', to: '2026-12-31', fundId: null, congregationId: null },
  scopeLabel: 'Sede Central',
  fundLabel: 'Todos los fondos',
  totals: { income: 3_518_500, expense: 1_200_000, balance: 2_318_500 },
  previous: { from: '2025-01-01', to: '2025-12-31', income: 2_000_000, expense: 1_000_000, balance: 1_000_000 },
  months: [
    { year: 2026, month: 10, label: 'Octubre 2026', shortLabel: 'Oct.', income: 3_518_500, expense: 1_200_000, balance: 2_318_500, periodStatus: 'CLOSED' },
    { year: 2026, month: 11, label: 'Noviembre 2026', shortLabel: 'Nov.', income: 0, expense: 0, balance: 0, periodStatus: 'OPEN' },
  ],
  funds: [{ fundId: 1, name: 'Fondo Local', opening: 1_000_000, inflows: 3_518_500, outflows: 1_200_000, closing: 3_318_500 }],
  accounts: [{ accountId: 1, code: '410505', name: 'Diezmos', nature: 'INCOME', amount: 3_000_000 }],
  contributionTypes: [{ contributionTypeId: 1, name: 'Diezmo', category: 'TITHE', count: 2, amount: 3_000_000, share: 1 }],
  contributionsTotal: 3_000_000,
  contributionsCount: 2,
  pendingConsolidation: { count: 0, amount: 0 },
  otherIncome: 518_500,
  congregations: null,
  closedPeriods: 1,
  openPeriods: 1,
};

class FakeReportsRepository extends ReportsRepository {
  readonly queries: ReportQuery[] = [];
  readonly detailQueries: ReportQuery[] = [];
  failReport: DomainError | null = null;
  pending = { count: 0, amount: 0 };
  failDetail: DomainError | null = null;

  options(): Observable<ReportOptions> {
    return of(OPTIONS);
  }

  financialReport(query: ReportQuery): Observable<FinancialReport> {
    this.queries.push(query);
    return this.failReport ? throwError(() => this.failReport) : of({ ...REPORT, query, pendingConsolidation: this.pending });
  }

  contributionDetailCsv(query: ReportQuery): Observable<Blob> {
    this.detailQueries.push(query);
    return this.failDetail ? throwError(() => this.failDetail) : of(new Blob(['csv']));
  }
}

async function render(permissions?: Permission[], pending = { count: 0, amount: 0 }) {
  sessionStorage.clear();
  const gateway = new FakeAuthGateway();
  if (permissions) {
    gateway.permissions = permissions;
  }
  const repository = new FakeReportsRepository();
  repository.pending = pending;
  const downloads = { save: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthGateway, useValue: gateway },
      { provide: ReportsRepository, useValue: repository },
      { provide: FileDownloadService, useValue: downloads },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('jorge@iglesia.example', 'x'));
  const fixture = TestBed.createComponent(ReportsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, repository, downloads, element: fixture.nativeElement as HTMLElement };
}

describe('ReportsPage', () => {
  it('shows the error banner with a retry when the report fails to load', async () => {
    sessionStorage.clear();
    const repository = new FakeReportsRepository();
    repository.failReport = new DomainError('INVALID_RANGE', 'Indica fechas válidas en «Desde» y «Hasta».');
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthGateway, useClass: FakeAuthGateway },
        { provide: ReportsRepository, useValue: repository },
      ],
    });
    await firstValueFrom(TestBed.inject(AuthService).login('jorge@iglesia.example', 'x'));
    const fixture = TestBed.createComponent(ReportsPage);
    await fixture.whenStable();

    const banner = (fixture.nativeElement as HTMLElement).querySelector('app-error-banner');
    expect(banner?.textContent).toContain('Indica fechas válidas en «Desde» y «Hasta».');
    expect(banner?.querySelector('button')?.textContent).toContain('Reintentar');
  });

  it('asks for the whole year of the server date and shows the hero, the cards and the first tab', async () => {
    const { repository, element } = await render();

    expect(repository.queries[0]).toEqual({ from: '2026-01-01', to: '2026-12-31', fundId: null, congregationId: null });
    expect(element.querySelector('app-hero-card')?.textContent).toMatch(/\$\s2\.318\.500/);
    expect(element.querySelector('app-hero-card')?.textContent).toContain('+131,9 %');
    expect(element.querySelectorAll('app-stat-card')).toHaveLength(4);
    expect(element.querySelector('app-monthly-flow')).not.toBeNull();
    expect(element.querySelector('app-fund-balances')).toBeNull();
  });

  it('says nothing about consolidation when everything recorded is already in the cash book', async () => {
    const { element } = await render();

    expect(element.textContent).not.toContain('sin consolidar');
  });

  it('warns that recorded contributions are not in the cash figures yet and links to the cash book', async () => {
    const { element } = await render(['reports.read', 'cash-transactions.write'], { count: 3, amount: 450_000 });

    const warning = element.querySelector('.alert--warning');
    expect(warning?.textContent).toContain('3 aportes registrados');
    expect(warning?.textContent).toMatch(/\$\s450\.000/);
    expect(warning?.textContent).toContain('sin consolidar');
    expect(warning?.querySelector('a[href="/accounting/cash-book"]')).not.toBeNull();
  });

  it('without cash-book access it asks Tesorería instead of linking', async () => {
    const { element } = await render(['reports.read'], { count: 1, amount: 90_000 });

    const warning = element.querySelector('.alert--warning');
    expect(warning?.textContent).toContain('1 aporte registrado');
    expect(warning?.querySelector('a')).toBeNull();
    expect(warning?.textContent).toContain('Pide a Tesorería');
  });

  it('switches to funds and accounts, and to contributions', async () => {
    const { fixture, element } = await render();

    element.querySelector<HTMLButtonElement>('#rep-tab-funds')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-fund-balances')).not.toBeNull();
    expect(element.querySelector('app-account-statement')?.textContent).toContain('Diezmos');

    element.querySelector<HTMLButtonElement>('#rep-tab-contributions')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-contribution-types')).not.toBeNull();
  });

  it('downloads the contribution detail built by the server and says it was audited', async () => {
    const { fixture, repository, downloads, element } = await render();

    const button = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('Exportar detalle de aportes'))!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(repository.detailQueries).toHaveLength(1);
    expect(downloads.save).toHaveBeenCalledWith(expect.any(Blob), 'reporte-detalle-aportes-2026-01-01-a-2026-12-31.csv');
    expect(element.textContent).toContain('quedó registrada en auditoría');
  });

  it('shows the message of the API when the detail export fails', async () => {
    const { fixture, repository, downloads, element } = await render();
    repository.failDetail = new DomainError('EXPORT_TOO_LARGE', 'El rango tiene demasiados aportes para un solo archivo.', 422);

    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes('Exportar detalle de aportes'))!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(downloads.save).not.toHaveBeenCalled();
    expect(element.querySelector('.alert--danger')?.textContent).toContain('demasiados aportes');
  });

  it('does not offer the detail export without contributions.write', async () => {
    const { element } = await render(['reports.read']);

    expect(Array.from(element.querySelectorAll('button')).some((b) => b.textContent?.includes('Exportar detalle de aportes'))).toBe(false);
  });
});
