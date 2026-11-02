import { Observable } from 'rxjs';
import { SessionUser } from './session.model';

/**
 * Port to the identity provider. The demo adapter replaces the API until Sprint 1 delivers
 * AuthModule (login, rotating refresh token in an HttpOnly cookie, password recovery).
 */
export abstract class AuthGateway {
  /** Fails with DomainError 'INVALID_CREDENTIALS' or 'ACCOUNT_LOCKED' and a generic message. */
  abstract login(email: string, password: string): Observable<SessionUser>;

  /** Restores the session after a reload (the API does it with the refresh cookie). */
  abstract restore(): Observable<SessionUser | null>;

  abstract logout(): Observable<void>;

  /** Always succeeds, whether the email exists or not, so it reveals nothing. */
  abstract requestPasswordReset(email: string): Observable<void>;
}
