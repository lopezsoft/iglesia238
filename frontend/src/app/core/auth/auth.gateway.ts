import { Observable } from 'rxjs';
import { SessionUser } from './session.model';

/** What the invitation link says about the account being activated (nothing secret). */
export interface InvitationInfo {
  readonly email: string;
  readonly displayName: string | null;
  /** ISO date-time at which the link expires, when the API reports it. */
  readonly expiresAt: string | null;
}

/**
 * Port to the identity provider. The HTTP adapter talks to /api/auth: login, rotating refresh
 * token in an HttpOnly cookie, password recovery and invitations.
 */
export abstract class AuthGateway {
  /** Fails with DomainError 'INVALID_CREDENTIALS' (also while the account is locked) and a generic message. */
  abstract login(email: string, password: string): Observable<SessionUser>;

  /** Restores the session after a reload (the API does it with the refresh cookie). */
  abstract restore(): Observable<SessionUser | null>;

  /**
   * Reads the session again with the current access token (roles, permissions and sedes as they are
   * now). The default restores it; the HTTP adapter asks `/auth/me` without rotating any token.
   */
  session(): Observable<SessionUser | null> {
    return this.restore();
  }

  abstract logout(): Observable<void>;

  /** Always succeeds, whether the email exists or not, so it reveals nothing. */
  abstract requestPasswordReset(email: string): Observable<void>;

  /** Sets a new password with the one-time token of the recovery link. */
  abstract confirmPasswordReset(token: string, newPassword: string): Observable<void>;

  /** Checks an invitation link before showing the "create your password" form. */
  abstract getInvitation(token: string): Observable<InvitationInfo>;

  /** Activates the invited account with the password the person chose. */
  abstract acceptInvitation(token: string, password: string): Observable<void>;

  /** Changes the password of the signed-in user; the API closes their other sessions. */
  abstract changePassword(currentPassword: string, newPassword: string): Observable<void>;
}
