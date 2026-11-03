import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { Scope, SessionUser } from '../../../core/auth/session.model';
import { Page } from '../../../shared/utils/pagination';
import {
  GrantContext,
  InvitationResult,
  ManagedUser,
  OneTimeLink,
  RoleAssignmentView,
  RoleMatrix,
  UserQuery,
} from './data/user-roles.models';
import { UserRolesRepository } from './data/user-roles.repository';
import { UserRolesPage } from './user-roles.page';

const denomination: Scope = {
  kind: 'DENOMINATION',
  denominationId: 1,
  congregationId: null,
  label: 'Toda la denominación',
};
const session: SessionUser = {
  id: 1,
  displayName: 'Andrés Molina',
  email: 'andres@iglesia.example',
  assignments: [
    {
      role: 'DENOMINATION_ADMIN',
      roleName: 'Administrador de denominación',
      permissions: ['users.manage', 'congregations.manage', 'audit-logs.read'],
      scope: denomination,
    },
  ],
  selectableScopes: [denomination],
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

const PASTOR_ROLE: RoleAssignmentView = {
  id: 11,
  role: 'PASTOR',
  scope: 'CONGREGATION',
  denominationId: 1,
  congregationId: 10,
  scopeLabel: 'Sede Central',
  grantedByName: 'Equipo de plataforma',
  createdAt: '2026-10-01T10:00:00.000Z',
  revokedAt: null,
};

const DANIEL: ManagedUser = {
  id: 7,
  displayName: 'Daniel Herrera',
  email: 'daniel@iglesia.example',
  status: 'ACTIVE',
  lastLoginAt: null,
  isSelf: false,
  assignments: [PASTOR_ROLE],
};
const PAULA: ManagedUser = {
  id: 8,
  displayName: 'Paula Pendiente',
  email: 'paula@iglesia.example',
  status: 'INVITATION_PENDING',
  lastLoginAt: null,
  isSelf: false,
  assignments: [],
};

const CONTEXT: GrantContext = {
  isPlatformAdmin: false,
  audienceLabel: 'Monte de Sión',
  roles: [
    {
      role: 'DENOMINATION_ADMIN',
      scopes: [{ kind: 'DENOMINATION', denominationId: 1, congregationId: null, label: 'Toda la denominación' }],
    },
    {
      role: 'PASTOR',
      scopes: [{ kind: 'CONGREGATION', denominationId: 1, congregationId: 10, label: 'Sede Central' }],
    },
  ],
};

const MATRIX: RoleMatrix = {
  roles: [
    { code: 'PASTOR', name: 'Pastor', description: null, scopeKind: 'CONGREGATION', permissions: ['members.read'] },
    {
      code: 'TREASURER',
      name: 'Tesorero(a)',
      description: null,
      scopeKind: 'CONGREGATION',
      permissions: ['contributions.write'],
    },
  ],
  permissions: [
    { code: 'contributions.write', description: null },
    { code: 'members.read', description: null },
  ],
};

class FakeUserRolesRepository extends UserRolesRepository {
  readonly queries: UserQuery[] = [];
  issued = 0;
  /** The first user of the list is the signed-in administrator. */
  firstIsSelf = false;

  listUsers(query: UserQuery): Observable<Page<ManagedUser>> {
    this.queries.push(query);
    const first = this.firstIsSelf ? { ...DANIEL, isSelf: true } : DANIEL;
    const items =
      query.status === 'INVITATION_PENDING' ? [PAULA] : query.status === 'INACTIVE' ? [] : [first, PAULA];
    return of({ items, total: items.length, page: query.page, pageSize: query.pageSize });
  }
  grantContext(): Observable<GrantContext> {
    return of(CONTEXT);
  }
  roleMatrix(): Observable<RoleMatrix> {
    return of(MATRIX);
  }
  grantRole(): Observable<RoleAssignmentView> {
    return of(PASTOR_ROLE);
  }
  revokeRole(): Observable<RoleAssignmentView> {
    return of({ ...PASTOR_ROLE, revokedAt: '2026-11-02T10:00:00.000Z' });
  }
  inviteUser(): Observable<InvitationResult> {
    return of({
      user: PAULA,
      invitation: {
        link: 'https://app.test/login/accept-invitation?token=nueva',
        expiresAt: '2026-11-05T10:00:00.000Z',
        purpose: 'INVITATION',
        emailDelivered: false,
      },
    });
  }
  issueLink(): Observable<OneTimeLink> {
    this.issued += 1;
    return of({
      link: 'https://app.test/login/accept-invitation?token=abc',
      expiresAt: '2026-11-05T10:00:00.000Z',
      purpose: 'INVITATION',
      emailDelivered: false,
    });
  }
}

async function render(firstIsSelf = false) {
  sessionStorage.clear();
  const repository = new FakeUserRolesRepository();
  repository.firstIsSelf = firstIsSelf;
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthGateway, useClass: FakeAuthGateway },
      { provide: UserRolesRepository, useValue: repository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('andres@iglesia.example', 'x'));
  const fixture = TestBed.createComponent(UserRolesPage);
  await fixture.whenStable();
  return { fixture, repository, element: fixture.nativeElement as HTMLElement };
}

describe('UserRolesPage', () => {
  beforeAll(() => {
    // jsdom has no native <dialog> modal support.
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('lists the users the API returns, with their roles and status', async () => {
    const { element } = await render();

    const rows = Array.from(element.querySelectorAll('app-user-table tbody tr'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Daniel Herrera');
    expect(rows[0].textContent).toContain('Pastor · Sede Central');
    expect(rows[1].textContent).toContain('Invitación pendiente');
  });

  it('asks the server for totals with one-row queries for the KPI cards', async () => {
    const { repository } = await render();

    const pendingQuery = repository.queries.find((query) => query.status === 'INVITATION_PENDING' && query.pageSize === 1);
    const inactiveQuery = repository.queries.find((query) => query.status === 'INACTIVE' && query.pageSize === 1);
    expect(pendingQuery).toBeDefined();
    expect(inactiveQuery).toBeDefined();
  });

  it('filters by status on the server and goes back to the first page', async () => {
    const { fixture, repository, element } = await render();

    const pending = Array.from(element.querySelectorAll<HTMLButtonElement>('.segmented__option')).find((button) =>
      button.textContent?.includes('Pendientes'),
    );
    pending?.click();
    await fixture.whenStable();

    const last = repository.queries.at(-1);
    expect(last).toMatchObject({ status: 'INVITATION_PENDING', page: 1, pageSize: 20 });
    expect(element.querySelectorAll('app-user-table tbody tr')).toHaveLength(1);
  });

  it('opens the role panel of the selected user and generates a link on demand', async () => {
    const { fixture, repository, element } = await render();

    element.querySelector<HTMLButtonElement>('.user-cell__name')?.click();
    await fixture.whenStable();
    const generate = Array.from(element.querySelectorAll<HTMLButtonElement>('app-user-role-panel .btn')).find(
      (button) => button.textContent?.includes('Generar enlace de recuperación'),
    );
    generate?.click();
    await fixture.whenStable();

    expect(element.querySelector('app-user-role-panel')?.textContent).toContain('Roles de Daniel Herrera');
    expect(repository.issued).toBe(1);
    expect(element.querySelector<HTMLInputElement>('#one-time-link')?.value).toContain('token=abc');
  });

  it('does not offer to assign a role to yourself: the API refuses it (SELF_GRANT)', async () => {
    const { fixture, element } = await render(true);

    element.querySelector<HTMLButtonElement>('.user-cell__name')?.click();
    await fixture.whenStable();

    const panel = element.querySelector('app-user-role-panel');
    expect(panel?.textContent).toContain('No puedes asignarte roles a ti mismo');
    expect(panel?.querySelector('app-assign-role-form')).toBeNull();
  });

  it('offers the assign form for another user', async () => {
    const { fixture, element } = await render();

    element.querySelector<HTMLButtonElement>('.user-cell__name')?.click();
    await fixture.whenStable();

    expect(element.querySelector('app-user-role-panel app-assign-role-form')).not.toBeNull();
  });

  it('reads the session again after a role changes, so the menu and the sedes follow it', async () => {
    const { fixture } = await render();
    const refresh = vi.spyOn(TestBed.inject(AuthService), 'refreshSession');

    (fixture.componentInstance as unknown as { onChanged(message: string): void }).onChanged('Rol revocado.');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('shows the matrix of roles and permissions read from the API', async () => {
    const { fixture, element } = await render();

    const tab = Array.from(element.querySelectorAll<HTMLButtonElement>('.tab-card')).find((button) =>
      button.textContent?.includes('Roles y permisos'),
    );
    tab?.click();
    await fixture.whenStable();

    const headers = Array.from(element.querySelectorAll('.matrix thead th')).map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Permiso', 'Pastor', 'Tesorero(a)']);
    const rows = Array.from(element.querySelectorAll('.matrix tbody tr'));
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('members.read');
    expect(rows[1].querySelectorAll('.matrix__yes')).toHaveLength(1);
  });
});
