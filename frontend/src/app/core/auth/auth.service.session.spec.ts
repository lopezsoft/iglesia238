import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AccessTokenStore } from '../http/access-token.store';
import { AuthGateway, InvitationInfo } from './auth.gateway';
import { AuthService } from './auth.service';
import { Scope, SessionUser } from './session.model';

const denomination: Scope = { kind: 'DENOMINATION', denominationId: 2, congregationId: null, label: 'Toda la denominación' };
const sedeNorte: Scope = { kind: 'CONGREGATION', denominationId: 2, congregationId: 5, label: 'Sede Norte' };
const sedeSur: Scope = { kind: 'CONGREGATION', denominationId: 2, congregationId: 6, label: 'Sede Sur' };

/** Session as the API issues it: permissions travel with each assignment. */
const apiSession: SessionUser = {
  id: 1,
  displayName: 'Lucía Gómez',
  email: 'lucia@iglesia.example',
  emailVerified: true,
  assignments: [
    { role: 'DENOMINATION_ADMIN', roleName: 'Administrador de denominación', permissions: ['congregations.manage', 'members.read'], scope: denomination },
    { role: 'TREASURER', roleName: 'Tesorero(a)', permissions: ['contributions.write'], scope: sedeSur },
  ],
  selectableScopes: [denomination, sedeNorte, sedeSur],
};

class FakeAuthGateway extends AuthGateway {
  /** What GET /auth/me answers now; null makes it fail. */
  static current: SessionUser | null = apiSession;

  login(): Observable<SessionUser> {
    return of(apiSession);
  }
  override session(): Observable<SessionUser | null> {
    return FakeAuthGateway.current
      ? of(FakeAuthGateway.current)
      : throwError(() => new Error('offline'));
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

function setup(): { auth: AuthService; tokens: AccessTokenStore; router: Router } {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthGateway, useClass: FakeAuthGateway }],
  });
  return { auth: TestBed.inject(AuthService), tokens: TestBed.inject(AccessTokenStore), router: TestBed.inject(Router) };
}

describe('AuthService with an API session', () => {
  it('takes the permissions of the active scope from the assignments, not from a local table', async () => {
    const { auth } = setup();
    await firstValueFrom(auth.login('lucia@iglesia.example', 'x'));

    auth.selectScope(sedeNorte);
    expect(auth.can('members.read')).toBe(true);
    expect(auth.can('contributions.write')).toBe(false);
    expect(auth.activeRoleNames()).toEqual(['Administrador de denominación']);

    auth.selectScope(sedeSur);
    expect(auth.can('members.read')).toBe(true);
    expect(auth.can('contributions.write')).toBe(true);
    expect(auth.activeRoleNames()).toEqual(['Administrador de denominación', 'Tesorero(a)']);
  });

  describe('refreshSession', () => {
    const sedeNueva: Scope = { kind: 'CONGREGATION', denominationId: 2, congregationId: 7, label: 'Sede Nueva' };

    afterEach(() => {
      FakeAuthGateway.current = apiSession;
    });

    it('brings in a sede created after sign-in and keeps the active scope', async () => {
      const { auth } = setup();
      await firstValueFrom(auth.login('lucia@iglesia.example', 'x'));
      auth.selectScope(sedeSur);
      FakeAuthGateway.current = { ...apiSession, selectableScopes: [...apiSession.selectableScopes, sedeNueva] };

      await auth.refreshSession();

      expect(auth.user()?.selectableScopes.map((scope) => scope.label)).toContain('Sede Nueva');
      expect(auth.activeScope()?.label).toBe('Sede Sur');
    });

    it('applies a role granted after sign-in and falls back when the active sede is gone', async () => {
      const { auth } = setup();
      await firstValueFrom(auth.login('lucia@iglesia.example', 'x'));
      auth.selectScope(sedeSur);
      FakeAuthGateway.current = {
        ...apiSession,
        assignments: [apiSession.assignments[0]],
        selectableScopes: [denomination, sedeNorte],
      };

      await auth.refreshSession();

      expect(auth.activeScope()?.label).toBe('Toda la denominación');
      expect(auth.can('contributions.write')).toBe(false);
    });

    it('keeps the current session when the refresh fails', async () => {
      const { auth } = setup();
      await firstValueFrom(auth.login('lucia@iglesia.example', 'x'));
      FakeAuthGateway.current = null;

      await auth.refreshSession();

      expect(auth.isAuthenticated()).toBe(true);
      expect(auth.user()?.selectableScopes).toHaveLength(3);
    });

    it('does nothing when nobody is signed in', async () => {
      const { auth } = setup();

      await auth.refreshSession();

      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('handleEmailNotVerified', () => {
    afterEach(() => {
      FakeAuthGateway.current = apiSession;
    });

    it('reads the session again and sends the person to the locked page when the server still sees it unconfirmed', async () => {
      const { auth, router } = setup();
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      await firstValueFrom(auth.login('lucia@iglesia.example', 'x'));
      FakeAuthGateway.current = { ...apiSession, emailVerified: false };

      await auth.handleEmailNotVerified();

      expect(auth.emailVerified()).toBe(false);
      expect(navigate).toHaveBeenCalledWith('/confirm-email', { replaceUrl: true });
    });

    it('trusts the API over a session that claims the e-mail is confirmed', async () => {
      const { auth, router } = setup();
      vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      await firstValueFrom(auth.login('lucia@iglesia.example', 'x'));

      await auth.handleEmailNotVerified();

      expect(auth.emailVerified()).toBe(false);
    });

    it('does nothing without a session', async () => {
      const { auth, router } = setup();
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

      await auth.handleEmailNotVerified();

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('signs the user out when the session can no longer be renewed', async () => {
    const { auth, tokens, router } = setup();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await firstValueFrom(auth.login('lucia@iglesia.example', 'x'));

    tokens.expire();

    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired' } });
  });
});
