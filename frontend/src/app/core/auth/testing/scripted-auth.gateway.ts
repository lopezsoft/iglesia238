import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../errors/domain-error';
import { AuthGateway, EmailVerificationResend, InvitationInfo } from '../auth.gateway';
import { SessionUser } from '../session.model';

export const SCRIPTED_PASSWORD = 'clave-de-prueba';

/**
 * Test double of the identity provider: it answers with the sessions a spec hands it and keeps
 * the "signed-in" session in memory so restore() behaves like the refresh cookie would.
 * It lives in testing/ and is imported only from *.spec.ts files.
 */
export class ScriptedAuthGateway extends AuthGateway {
  private current: SessionUser | null = null;

  constructor(private readonly sessions: readonly SessionUser[]) {
    super();
  }

  login(email: string, password: string): Observable<SessionUser> {
    const session = this.sessions.find((item) => item.email === email.trim().toLowerCase());
    if (!session || password !== SCRIPTED_PASSWORD) {
      return throwError(() => new DomainError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'));
    }
    this.current = session;
    return of(session);
  }

  restore(): Observable<SessionUser | null> {
    return of(this.current);
  }

  logout(): Observable<void> {
    this.current = null;
    return of(undefined);
  }

  requestPasswordReset(): Observable<void> {
    return of(undefined);
  }

  confirmPasswordReset(): Observable<void> {
    return of(undefined);
  }

  getInvitation(): Observable<InvitationInfo> {
    return of({ email: 'invitada@iglesia.example', displayName: null, expiresAt: null });
  }

  acceptInvitation(): Observable<void> {
    return of(undefined);
  }

  changePassword(): Observable<void> {
    return of(undefined);
  }

  confirmEmail(): Observable<void> {
    return of(undefined);
  }

  resendEmailVerification(): Observable<EmailVerificationResend> {
    return of({ devVerificationLink: null });
  }
}
