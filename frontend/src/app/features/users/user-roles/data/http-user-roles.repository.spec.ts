import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpUserRolesRepository } from './http-user-roles.repository';
import { ManagedUser, hasActiveEquivalent, initialsOf } from './user-roles.models';
import { UserRolesRepository } from './user-roles.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: UserRolesRepository, useClass: HttpUserRolesRepository },
    ],
  });
  return {
    repository: TestBed.inject(UserRolesRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

const USER: ManagedUser = {
  id: 4,
  displayName: 'Natalia Cárdenas',
  email: 'natalia@example.com',
  status: 'ACTIVE',
  lastLoginAt: null,
  isSelf: false,
  assignments: [
    {
      id: 9,
      role: 'PASTOR',
      scope: 'CONGREGATION',
      denominationId: 1,
      congregationId: 10,
      scopeLabel: 'Sede Central',
      grantedByName: null,
      createdAt: '2026-11-01T10:00:00.000Z',
      revokedAt: null,
    },
  ],
};

describe('HttpUserRolesRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists with server-side filters and leaves out the empty ones', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(
      repository.listUsers({ search: ' natalia ', role: '', status: 'INVITATION_PENDING', page: 2, pageSize: 20 }),
    );
    const request = backend.expectOne((req) => req.url === '/api/users');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['page', 'pageSize', 'search', 'status']);
    expect(request.request.params.get('search')).toBe('natalia');
    expect(request.request.params.get('status')).toBe('INVITATION_PENDING');
    request.flush({ items: [USER], total: 21, page: 2, pageSize: 20 });
    expect((await result).total).toBe(21);
  });

  it('sends the role filter when it is set', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(
      repository.listUsers({ search: '', role: 'TREASURER', status: '', page: 1, pageSize: 20 }),
    );
    const request = backend.expectOne((req) => req.url === '/api/users');

    expect(request.request.params.get('role')).toBe('TREASURER');
    request.flush({ items: [], total: 0, page: 1, pageSize: 20 });
    await result;
  });

  it('reads the grant context and the role matrix', async () => {
    const { repository, backend } = setup();

    const context = firstValueFrom(repository.grantContext());
    backend
      .expectOne('/api/users/grant-context')
      .flush({ isPlatformAdmin: true, audienceLabel: 'Plataforma', roles: [] });
    expect((await context).audienceLabel).toBe('Plataforma');

    const matrix = firstValueFrom(repository.roleMatrix());
    backend.expectOne('/api/roles').flush({ roles: [], permissions: [] });
    expect(await matrix).toEqual({ roles: [], permissions: [] });
  });

  it('grants a role in the route of the user without repeating the id in the body', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(
      repository.grantRole({ userId: 4, role: 'PASTOR', denominationId: null, congregationId: 10 }),
    );
    const request = backend.expectOne('/api/users/4/roles');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ role: 'PASTOR', denominationId: null, congregationId: 10 });
    request.flush(USER.assignments[0]);
    expect((await result).id).toBe(9);
  });

  it('revokes with POST (the row is kept)', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.revokeRole(9));
    const request = backend.expectOne('/api/user-roles/9/revoke');

    expect(request.request.method).toBe('POST');
    request.flush({ ...USER.assignments[0], revokedAt: '2026-11-02T10:00:00.000Z' });
    expect((await result).revokedAt).not.toBeNull();
  });

  it('invites and returns the one-time link to the administrator', async () => {
    const { repository, backend } = setup();
    const command = {
      displayName: 'Natalia Cárdenas',
      email: 'natalia@example.com',
      role: 'SECRETARY' as const,
      denominationId: null,
      congregationId: 10,
    };

    const result = firstValueFrom(repository.inviteUser(command));
    const request = backend.expectOne('/api/users/invitations');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(command);
    request.flush({
      user: USER,
      invitation: {
        link: 'https://app.test/login/accept-invitation?token=abc',
        expiresAt: '2026-11-05T10:00:00.000Z',
        purpose: 'INVITATION',
        emailDelivered: false,
      },
    });
    const { invitation } = await result;
    expect(invitation?.link).toContain('token=abc');
    expect(invitation?.emailDelivered).toBe(false);
  });

  it('asks for a new link of a user', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.issueLink(4));
    const request = backend.expectOne('/api/users/4/reset-link');

    expect(request.request.method).toBe('POST');
    request.flush({
      link: 'https://app.test/login/reset-password?token=xyz',
      expiresAt: '2026-11-03T10:00:00.000Z',
      purpose: 'PASSWORD_RESET',
      emailDelivered: false,
    });
    expect((await result).purpose).toBe('PASSWORD_RESET');
  });
});

describe('user role helpers', () => {
  it('detects an equivalent active assignment by role and scope', () => {
    const revoked = { ...USER.assignments[0], id: 10, revokedAt: '2026-11-02T10:00:00.000Z' };

    expect(hasActiveEquivalent(USER, revoked)).toBe(true);
    expect(hasActiveEquivalent(USER, { ...revoked, congregationId: 11 })).toBe(false);
    expect(hasActiveEquivalent(USER, { ...revoked, role: 'TREASURER' })).toBe(false);
  });

  it('builds the initials of the avatar', () => {
    expect(initialsOf('  natalia cárdenas ruiz')).toBe('NC');
  });
});
