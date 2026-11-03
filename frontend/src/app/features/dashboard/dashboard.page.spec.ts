import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, Subject, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../core/auth/auth.gateway';
import { AuthService } from '../../core/auth/auth.service';
import { Scope, SessionUser } from '../../core/auth/session.model';
import { DomainError } from '../../core/errors/domain-error';
import { FileDownloadService } from '../../shared/utils/file-download.service';
import { DashboardPage, shortName } from './dashboard.page';
import { DashboardPeriod, DashboardSummary } from './data/dashboard.models';
import { DashboardRepository } from './data/dashboard.repository';

const sede: Scope = { kind: 'CONGREGATION', denominationId: 1, congregationId: 10, label: 'Sede Norte' };
const otherSede: Scope = { kind: 'CONGREGATION', denominationId: 1, congregationId: 11, label: 'Sede Sur' };

const session: SessionUser = {
  id: 1,
  displayName: 'Laura Gómez',
  email: 'laura@iglesia.example',
  assignments: [{ role: 'SECRETARY', roleName: 'Secretaría', permissions: ['applications.review'], scope: sede }],
  selectableScopes: [sede, otherSede],
};

class FakeAuthGateway extends AuthGateway {
  login = () => of(session);
  restore = () => of<SessionUser | null>(session);
  logout = () => of(undefined);
  requestPasswordReset = () => of(undefined);
  confirmPasswordReset = () => of(undefined);
  getInvitation = (): Observable<InvitationInfo> => of({ email: 'x@y.z', displayName: null, expiresAt: null });
  acceptInvitation = () => of(undefined);
  changePassword = () => of(undefined);
}

function summary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    period: 'today',
    periodLabel: 'Hoy',
    previousLabel: 'ayer',
    asOf: '2026-11-02',
    range: { from: '2026-11-02', to: '2026-11-02' },
    scope: { kind: 'CONGREGATION', label: 'Sede Norte', denominationName: 'Iglesia' },
    hero: null,
    kpis: [],
    panels: [],
    lists: [],
    trends: [],
    unavailable: [],
    ...overrides,
  };
}

const HERO_SUMMARY = summary({
  hero: {
    key: 'activity',
    priority: 10,
    eyebrow: 'Actividad registrada',
    title: '¿Cómo va la actividad?',
    label: 'Eventos registrados · Hoy',
    value: 12,
    format: 'integer',
    previous: 8,
    series: [1, 2, 3, 5, 8, 8, 12],
    link: '/audit',
  },
  kpis: [
    {
      key: 'users',
      order: 1,
      tab: 'general',
      label: 'Usuarios activos',
      value: 7,
      format: 'integer',
      hint: '1 invitación pendiente',
      icon: 'users',
      tone: 'slate',
      link: '/users',
      previous: null,
    },
  ],
  panels: [
    {
      key: 'security',
      order: 1,
      tab: 'indicators',
      title: 'Seguridad y accesos',
      subtitle: 'Inicios de sesión y cuentas · hoy',
      icon: 'shield-check',
      tone: 'indigo',
      link: null,
      linkLabel: null,
      stats: [
        { key: 'locked', label: 'Cuentas bloqueadas', value: 2, format: 'integer', meta: null, icon: 'lock', tone: 'red' },
      ],
    },
  ],
  lists: [
    {
      key: 'recent-audit',
      order: 1,
      tab: 'general',
      title: 'Últimos eventos de auditoría',
      subtitle: null,
      icon: 'shield',
      tone: 'slate',
      emptyText: 'Aún no hay eventos registrados.',
      link: '/audit',
      linkLabel: 'Ver auditoría',
      items: [
        {
          id: '1',
          title: 'Emisión de certificado · Certificado',
          subtitle: 'Laura Gómez · Sede Norte',
          occurredAt: '2026-11-02T14:00:00.000Z',
          badge: null,
        },
      ],
    },
  ],
  trends: [
    {
      key: 'activity-trend',
      order: 1,
      tab: 'indicators',
      title: 'Actividad de los últimos 6 meses',
      subtitle: null,
      format: 'integer',
      tone: 'indigo',
      points: [
        { label: 'Oct', value: 4 },
        { label: 'Nov', value: 12 },
      ],
    },
  ],
});

class StubRepository extends DashboardRepository {
  readonly requested: DashboardPeriod[] = [];
  constructor(private readonly respond: (period: DashboardPeriod) => Observable<DashboardSummary>) {
    super();
  }
  summary(period: DashboardPeriod): Observable<DashboardSummary> {
    this.requested.push(period);
    return this.respond(period);
  }
}

async function render(repository: StubRepository, downloads?: Pick<FileDownloadService, 'save'>) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthGateway, useClass: FakeAuthGateway },
      { provide: DashboardRepository, useValue: repository },
      ...(downloads ? [{ provide: FileDownloadService, useValue: downloads }] : []),
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('laura@iglesia.example', 'x'));
  const fixture = TestBed.createComponent(DashboardPage);
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('DashboardPage', () => {
  it('shows the error banner with a retry when the summary fails to load', async () => {
    const { element } = await render(
      new StubRepository(() => throwError(() => new DomainError('UNAUTHENTICATED', 'Inicia sesión para ver el resumen.'))),
    );

    const banner = element.querySelector('app-error-banner');
    expect(banner?.textContent).toContain('Inicia sesión para ver el resumen.');
    expect(banner?.querySelector('button')?.textContent).toContain('Reintentar');
  });

  it('draws the hero with the comparison against the previous period, and the KPI', async () => {
    const { element } = await render(new StubRepository(() => of(HERO_SUMMARY)));

    const hero = element.querySelector('app-hero-card');
    expect(text(hero)).toContain('¿Cómo va la actividad?');
    expect(text(hero)).toContain('Eventos registrados · Hoy');
    expect(text(hero)).toContain('+50 %');
    expect(text(hero)).toContain('vs. ayer · 8');
    expect(hero?.querySelector('app-sparkline')).not.toBeNull();
    expect(text(element.querySelector('app-stat-card'))).toContain('Usuarios activos');
    expect(text(element.querySelector('app-widget-list'))).toContain('Emisión de certificado · Certificado');
  });

  it('says "Sin comparativo" and draws no sparkline when the API has no history', async () => {
    const withoutHistory = summary({
      hero: { ...(HERO_SUMMARY.hero as NonNullable<DashboardSummary['hero']>), previous: null, series: [] },
    });
    const { element } = await render(new StubRepository(() => of(withoutHistory)));

    const hero = element.querySelector('app-hero-card');
    expect(text(hero)).toContain('Sin comparativo');
    expect(hero?.querySelector('app-sparkline')).toBeNull();
  });

  it('asks the API for the period chosen in the segmented control', async () => {
    const repository = new StubRepository(() => of(HERO_SUMMARY));
    const { fixture, element } = await render(repository);

    const option = Array.from(element.querySelectorAll<HTMLButtonElement>('app-hero-card [role="radio"]')).find(
      (button) => button.textContent?.trim() === '7 días',
    );
    option?.click();
    await fixture.whenStable();

    expect(repository.requested).toEqual(['today', '7d']);
  });

  it('keeps the previous figures on screen while another period loads', async () => {
    const pending = new Subject<DashboardSummary>();
    const repository = new StubRepository((period) => (period === 'today' ? of(HERO_SUMMARY) : pending));
    const { fixture, element } = await render(repository);

    element
      .querySelectorAll<HTMLButtonElement>('app-hero-card [role="radio"]')
      .item(2)
      .click();
    // The request never answers, so the fixture cannot become stable: let the change run by hand.
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(repository.requested).toEqual(['today', '7d']);
    expect(element.querySelector('app-hero-card')).not.toBeNull();
    expect(element.querySelector('.dash--refreshing')).not.toBeNull();
  });

  it('switches to the indicators tab with its panels and trends, and back', async () => {
    const { fixture, element } = await render(new StubRepository(() => of(HERO_SUMMARY)));

    element.querySelector<HTMLButtonElement>('#dash-tab-indicators')?.click();
    await fixture.whenStable();

    expect(text(element.querySelector('app-widget-panel'))).toContain('Seguridad y accesos');
    expect(text(element.querySelector('app-widget-trend'))).toContain('Actividad de los últimos 6 meses');
    expect(element.querySelector('app-hero-card')).toBeNull();

    element.querySelector<HTMLButtonElement>('#dash-tab-general')?.click();
    await fixture.whenStable();
    expect(element.querySelector('app-hero-card')).not.toBeNull();
  });

  it('says so, instead of showing zeros, when the role has no figures yet', async () => {
    const { element } = await render(new StubRepository(() => of(summary())));

    expect(text(element)).toContain('Aún no hay cifras para tu rol');
    expect(element.querySelector('app-stat-card')).toBeNull();
    expect(element.querySelector('app-quick-access')).not.toBeNull();
  });

  it('warns when some areas could not be loaded', async () => {
    const { element } = await render(new StubRepository(() => of(summary({ unavailable: ['accounting'] }))));

    expect(text(element.querySelector('.alert--warning'))).toContain('No se pudieron cargar algunas cifras');
  });

  it('downloads a CSV of the loaded figures', async () => {
    const save = vi.fn();
    const { fixture, element } = await render(new StubRepository(() => of(HERO_SUMMARY)), { save });

    element.querySelector<HTMLButtonElement>('app-export-actions button')?.click();
    await fixture.whenStable();

    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][1]).toBe('resumen-today-2026-11-02.csv');
    const blob = save.mock.calls[0][0] as Blob;
    expect(blob.type).toContain('text/csv');
  });
});

describe('shortName', () => {
  it('drops the last word of a longer name', () => {
    expect(shortName('Pastor Daniel Herrera')).toBe('Pastor Daniel');
    expect(shortName('Laura Gómez')).toBe('Laura');
    expect(shortName('Laura')).toBe('Laura');
    expect(shortName('')).toBe('');
  });
});
