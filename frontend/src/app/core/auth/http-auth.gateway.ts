import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';
import { AccessTokenStore } from '../http/access-token.store';
import { apiUrl } from '../http/api-url';
import { AuthGateway, EmailVerificationResend, InvitationInfo } from './auth.gateway';
import { Permission } from './permission';
import { RoleCode } from './role';
import { RoleAssignment, Scope, ScopeKind, SessionUser } from './session.model';

interface ScopeDto {
  readonly kind: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly label: string;
}

interface AssignmentDto {
  readonly role: RoleCode;
  readonly roleName: string;
  readonly permissions: readonly string[];
  readonly scope: ScopeDto;
}

/** `session` object of POST /auth/login, POST /auth/refresh and GET /auth/me. */
export interface SessionDto {
  readonly id: number;
  readonly displayName: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly assignments: readonly AssignmentDto[];
  readonly selectableScopes: readonly ScopeDto[];
}

interface TokenResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly session?: SessionDto;
}

interface EmailVerificationResendDto {
  readonly devVerificationLink?: string | null;
}

interface InvitationDto {
  readonly email: string;
  readonly displayName?: string | null;
  readonly expiresAt?: string | null;
}

/** Identity provider adapter over the REST API (`/api/auth/*`). */
@Injectable()
export class HttpAuthGateway extends AuthGateway {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(AccessTokenStore);

  login(email: string, password: string): Observable<SessionUser> {
    return this.http.post<TokenResponse>(apiUrl('/auth/login'), { email, password }).pipe(
      tap((response) => this.tokens.set(response.accessToken)),
      map((response) => toSessionUser(requireSession(response))),
    );
  }

  restore(): Observable<SessionUser | null> {
    return this.http.post<TokenResponse>(apiUrl('/auth/refresh'), {}).pipe(
      tap((response) => this.tokens.set(response.accessToken)),
      // One trip when the API returns the session with the new token; otherwise ask for it.
      switchMap((response) =>
        response.session ? of(response.session) : this.http.get<SessionDto>(apiUrl('/auth/me')),
      ),
      map((session): SessionUser | null => toSessionUser(session)),
      // No cookie, expired or revoked: the person simply has to sign in.
      catchError(() => {
        this.tokens.clear();
        return of(null);
      }),
    );
  }

  override session(): Observable<SessionUser | null> {
    return this.http.get<SessionDto>(apiUrl('/auth/me')).pipe(map((session) => toSessionUser(session)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(apiUrl('/auth/logout'), {}).pipe(
      // The session ends locally whatever the server answers.
      catchError(() => of(undefined)),
      tap(() => this.tokens.clear()),
      map(() => undefined),
    );
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.http.post<void>(apiUrl('/auth/password-reset/request'), { email }).pipe(map(() => undefined));
  }

  confirmPasswordReset(token: string, newPassword: string): Observable<void> {
    return this.http
      .post<void>(apiUrl('/auth/password-reset/confirm'), { token, newPassword })
      .pipe(map(() => undefined));
  }

  getInvitation(token: string): Observable<InvitationInfo> {
    // The token goes in the body, not in the URL: URLs end up in proxy and access logs.
    return this.http.post<InvitationDto>(apiUrl('/auth/invitations/lookup'), { token }).pipe(
      map((invitation) => ({
        email: invitation.email,
        displayName: invitation.displayName ?? null,
        expiresAt: invitation.expiresAt ?? null,
      })),
    );
  }

  acceptInvitation(token: string, password: string): Observable<void> {
    return this.http.post<void>(apiUrl('/auth/invitations/accept'), { token, password }).pipe(map(() => undefined));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http
      .post<void>(apiUrl('/auth/change-password'), { currentPassword, newPassword })
      .pipe(map(() => undefined));
  }

  confirmEmail(token: string): Observable<void> {
    // The token goes in the body, not in the URL: URLs end up in proxy and access logs.
    return this.http.post<void>(apiUrl('/auth/email-verification/confirm'), { token }).pipe(map(() => undefined));
  }

  resendEmailVerification(): Observable<EmailVerificationResend> {
    return this.http
      .post<EmailVerificationResendDto | null>(apiUrl('/auth/email-verification/resend'), {})
      .pipe(map((body) => ({ devVerificationLink: body?.devVerificationLink ?? null })));
  }
}

function requireSession(response: TokenResponse): SessionDto {
  if (!response.session) {
    throw new Error('The login response carries no session.');
  }
  return response.session;
}

/** Maps the API session to the model of the app (permissions come from the database). */
export function toSessionUser(dto: SessionDto): SessionUser {
  const assignments: RoleAssignment[] = dto.assignments.map((assignment) => ({
    role: assignment.role,
    roleName: assignment.roleName,
    permissions: assignment.permissions as readonly Permission[],
    scope: toScope(assignment.scope),
  }));
  return {
    id: dto.id,
    displayName: dto.displayName,
    email: dto.email,
    // Only an explicit false locks the app; the API enforces the rule on every domain call anyway.
    emailVerified: dto.emailVerified !== false,
    assignments,
    selectableScopes: dto.selectableScopes.map(toScope),
  };
}

function toScope(dto: ScopeDto): Scope {
  return {
    kind: dto.kind,
    denominationId: dto.denominationId,
    congregationId: dto.congregationId,
    label: dto.label,
  };
}
