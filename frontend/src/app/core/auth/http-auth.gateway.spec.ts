import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AccessTokenStore } from '../http/access-token.store';
import { HttpAuthGateway, SessionDto } from './http-auth.gateway';

const platformScope = { kind: 'PLATFORM', denominationId: null, congregationId: null, label: 'Plataforma' } as const;

const session: SessionDto = {
  id: 7,
  displayName: 'Ana Pérez',
  email: 'ana@iglesia.example',
  assignments: [
    {
      role: 'PLATFORM_ADMIN',
      roleName: 'Administrador de plataforma',
      permissions: ['denominations.manage', 'users.manage'],
      scope: platformScope,
    },
  ],
  selectableScopes: [platformScope],
};

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), HttpAuthGateway],
  });
  return {
    gateway: TestBed.inject(HttpAuthGateway),
    backend: TestBed.inject(HttpTestingController),
    tokens: TestBed.inject(AccessTokenStore),
  };
}

describe('HttpAuthGateway', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('logs in with email and password, keeps the access token in memory and maps the session', async () => {
    const { gateway, backend, tokens } = setup();

    const result = firstValueFrom(gateway.login('ana@iglesia.example', 'secreto-largo'));
    const request = backend.expectOne('/api/auth/login');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ email: 'ana@iglesia.example', password: 'secreto-largo' });
    request.flush({ accessToken: 'abc', expiresIn: 900, session });

    const user = await result;
    expect(tokens.token).toBe('abc');
    expect(user.displayName).toBe('Ana Pérez');
    expect(user.assignments[0].permissions).toEqual(['denominations.manage', 'users.manage']);
    expect(user.selectableScopes).toHaveLength(1);
    expect(JSON.stringify(localStorage)).not.toContain('abc');
  });

  it('restores the session from the refresh cookie in one trip', async () => {
    const { gateway, backend, tokens } = setup();

    const result = firstValueFrom(gateway.restore());
    backend.expectOne('/api/auth/refresh').flush({ accessToken: 'again', expiresIn: 900, session });

    expect((await result)?.email).toBe('ana@iglesia.example');
    expect(tokens.token).toBe('again');
  });

  it('asks for the session when the refresh answer has none', async () => {
    const { gateway, backend } = setup();

    const result = firstValueFrom(gateway.restore());
    backend.expectOne('/api/auth/refresh').flush({ accessToken: 'again', expiresIn: 900 });
    backend.expectOne('/api/auth/me').flush(session);

    expect((await result)?.id).toBe(7);
  });

  it('restores nothing when there is no valid refresh cookie', async () => {
    const { gateway, backend, tokens } = setup();
    tokens.set('stale');

    const result = firstValueFrom(gateway.restore());
    backend.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBeNull();
    expect(tokens.token).toBeNull();
  });

  it('forgets the token on logout even when the server fails', async () => {
    const { gateway, backend, tokens } = setup();
    tokens.set('abc');

    const result = firstValueFrom(gateway.logout());
    backend.expectOne('/api/auth/logout').flush({}, { status: 500, statusText: 'Server Error' });

    await result;
    expect(tokens.token).toBeNull();
  });

  it('calls the recovery, invitation and password endpoints with the agreed bodies', async () => {
    const { gateway, backend } = setup();

    const reset = firstValueFrom(gateway.requestPasswordReset('ana@iglesia.example'), { defaultValue: undefined });
    const resetRequest = backend.expectOne('/api/auth/password-reset/request');
    expect(resetRequest.request.body).toEqual({ email: 'ana@iglesia.example' });
    resetRequest.flush(null, { status: 202, statusText: 'Accepted' });
    await reset;

    const confirm = firstValueFrom(gateway.confirmPasswordReset('tok', 'nueva-clave-larga'), { defaultValue: undefined });
    const confirmRequest = backend.expectOne('/api/auth/password-reset/confirm');
    expect(confirmRequest.request.body).toEqual({ token: 'tok', newPassword: 'nueva-clave-larga' });
    confirmRequest.flush(null, { status: 204, statusText: 'No Content' });
    await confirm;

    const invitation = firstValueFrom(gateway.getInvitation('a b'));
    const lookup = backend.expectOne('/api/auth/invitations/lookup');
    expect(lookup.request.method).toBe('POST');
    expect(lookup.request.body).toEqual({ token: 'a b' });
    lookup.flush({ email: 'x@y.z', displayName: 'X' });
    expect(await invitation).toEqual({ email: 'x@y.z', displayName: 'X', expiresAt: null });

    const accept = firstValueFrom(gateway.acceptInvitation('tok', 'clave-larga-1'), { defaultValue: undefined });
    const acceptRequest = backend.expectOne('/api/auth/invitations/accept');
    expect(acceptRequest.request.body).toEqual({ token: 'tok', password: 'clave-larga-1' });
    acceptRequest.flush(null, { status: 204, statusText: 'No Content' });
    await accept;

    const refreshed = firstValueFrom(gateway.session());
    backend.expectOne('/api/auth/me').flush({
      id: 1,
      displayName: 'Ana',
      email: 'ana@iglesia.example',
      assignments: [],
      selectableScopes: [],
    });
    expect(await refreshed).toMatchObject({ id: 1, selectableScopes: [] });

    const change = firstValueFrom(gateway.changePassword('vieja', 'nueva-clave-larga'), { defaultValue: undefined });
    const changeRequest = backend.expectOne('/api/auth/change-password');
    expect(changeRequest.request.body).toEqual({ currentPassword: 'vieja', newPassword: 'nueva-clave-larga' });
    changeRequest.flush(null, { status: 204, statusText: 'No Content' });
    await change;
  });
});
