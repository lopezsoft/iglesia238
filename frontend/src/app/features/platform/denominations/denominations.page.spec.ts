import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError } from '../../../core/errors/domain-error';
import { Scope, SessionUser } from '../../../core/auth/session.model';
import { Page } from '../../../shared/utils/pagination';
import { DenominationsPage } from './denominations.page';
import {
  DenominationInput,
  DenominationQuery,
  DenominationStats,
  DenominationSummary,
} from './data/denominations.models';
import { DenominationsRepository } from './data/denominations.repository';

const platform: Scope = { kind: 'PLATFORM', denominationId: null, congregationId: null, label: 'Plataforma' };
const session: SessionUser = {
  id: 1,
  displayName: 'Equipo de plataforma',
  email: 'plataforma@iglesia.example',
  assignments: [
    {
      role: 'PLATFORM_ADMIN',
      roleName: 'Administrador de plataforma',
      permissions: ['denominations.manage', 'users.manage', 'audit-logs.read'],
      scope: platform,
    },
  ],
  selectableScopes: [platform],
};

class FakeAuthGateway extends AuthGateway {
  login(): Observable<SessionUser> {
    return of(session);
  }
  restore(): Observable<SessionUser | null> {
    return of(session);
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
  changePassword(): Observable<void> {
    return of(undefined);
  }
}

const SION: DenominationSummary = {
  id: 1,
  name: 'Iglesia Cristiana Monte de Sión',
  isActive: true,
  createdAt: '2026-10-01T15:00:00.000Z',
  legalEntityCount: 2,
  congregationCount: 3,
};
const VIDA: DenominationSummary = {
  id: 2,
  name: 'Vida Nueva',
  isActive: false,
  createdAt: '2026-10-05T15:00:00.000Z',
  legalEntityCount: 1,
  congregationCount: 1,
};

class FakeDenominationsRepository extends DenominationsRepository {
  readonly queries: DenominationQuery[] = [];
  failList = false;

  list(query: DenominationQuery): Observable<Page<DenominationSummary>> {
    this.queries.push(query);
    if (this.failList) {
      return throwError(() => new DomainError('SERVER_ERROR', 'El servidor no pudo completar la operación.'));
    }
    return of({ items: [SION, VIDA], total: 2, page: query.page, pageSize: query.pageSize });
  }
  stats(): Observable<DenominationStats> {
    return of({ total: 2, active: 1, congregations: 4 });
  }
  create(input: DenominationInput): Observable<DenominationSummary> {
    return of({ ...SION, name: input.name });
  }
  rename(_id: number, input: DenominationInput): Observable<DenominationSummary> {
    return of({ ...SION, name: input.name });
  }
  setActive(): Observable<DenominationSummary> {
    return of(SION);
  }
}

async function render() {
  sessionStorage.clear();
  const repository = new FakeDenominationsRepository();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthGateway, useClass: FakeAuthGateway },
      { provide: DenominationsRepository, useValue: repository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('plataforma@iglesia.example', 'x'));
  const fixture = TestBed.createComponent(DenominationsPage);
  await fixture.whenStable();
  return { fixture, repository, element: fixture.nativeElement as HTMLElement };
}

describe('DenominationsPage', () => {
  it('lists the denominations the API returns with their counts and status', async () => {
    const { element } = await render();

    const rows = Array.from(element.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Iglesia Cristiana Monte de Sión');
    expect(rows[0].textContent).toContain('Activa');
    expect(rows[1].textContent).toContain('Inactiva');
  });

  it('shows the totals of the platform in the KPI cards', async () => {
    const { element } = await render();

    const cards = Array.from(element.querySelectorAll('app-stat-card')).map((card) => card.textContent ?? '');
    expect(cards.some((text) => text.includes('Denominaciones registradas') && text.includes('2'))).toBe(true);
    expect(cards.some((text) => text.includes('Sedes en total') && text.includes('4'))).toBe(true);
    expect(cards.some((text) => text.includes('Promedio de sedes') && text.includes('2.0'))).toBe(true);
  });

  it('offers to create, edit and toggle because the role manages denominations', async () => {
    const { element } = await render();

    expect(element.textContent).toContain('Nueva denominación');
    expect(element.querySelector('[aria-label="Editar Vida Nueva"]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Activar Vida Nueva"]')).not.toBeNull();
    expect(element.querySelector('[aria-label="Desactivar Iglesia Cristiana Monte de Sión"]')).not.toBeNull();
  });

  it('asks the server for the first page with the page size of the screen', async () => {
    const { repository } = await render();

    expect(repository.queries[0]).toEqual({ search: '', status: 'all', page: 1, pageSize: 10 });
  });

  it('shows a retryable error instead of the table when the API fails', async () => {
    sessionStorage.clear();
    const repository = new FakeDenominationsRepository();
    repository.failList = true;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthGateway, useClass: FakeAuthGateway },
        { provide: DenominationsRepository, useValue: repository },
      ],
    });
    await firstValueFrom(TestBed.inject(AuthService).login('plataforma@iglesia.example', 'x'));
    const fixture = TestBed.createComponent(DenominationsPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('tbody')).toBeNull();
    expect(element.textContent).toContain('El servidor no pudo completar la operación.');
  });
});
