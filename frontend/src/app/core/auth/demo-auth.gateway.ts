import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { DemoDatabase } from '../demo/demo-database';
import { DEMO_PASSWORD } from '../demo/demo-fixtures';
import { demoCommand, demoResponse } from '../demo/demo-request';
import { DomainError } from '../errors/domain-error';
import { User } from '../models/identity.model';
import { AuthGateway } from './auth.gateway';
import { LOCK_MINUTES, MAX_FAILED_ATTEMPTS } from './auth-policy';
import { RoleAssignment, Scope, SessionUser, scopeKey } from './session.model';

export { LOCK_MINUTES, MAX_FAILED_ATTEMPTS };
const SESSION_STORAGE_KEY = 'iglesia238.demo.userId';
const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';

interface Attempts {
  failures: number;
  lockedUntil: number | null;
}

/** Demo identity provider: the demo users share DEMO_PASSWORD. Nothing is sent anywhere. */
@Injectable()
export class DemoAuthGateway extends AuthGateway {
  private readonly db = inject(DemoDatabase);
  private readonly attempts = new Map<string, Attempts>();

  login(email: string, password: string): Observable<SessionUser> {
    return demoCommand(() => {
      const key = email.trim().toLowerCase();
      const attempts = this.attempts.get(key) ?? { failures: 0, lockedUntil: null };
      if (attempts.lockedUntil !== null && attempts.lockedUntil > Date.now()) {
        throw new DomainError(
          'ACCOUNT_LOCKED',
          `Por seguridad, el acceso está bloqueado ${LOCK_MINUTES} minutos. Intenta más tarde.`,
        );
      }
      const user = this.db.users.find((item) => item.email === key && item.isActive && !item.invitationPending);
      if (!user || password !== DEMO_PASSWORD) {
        this.registerFailure(key, attempts);
        throw new DomainError('INVALID_CREDENTIALS', INVALID_CREDENTIALS);
      }
      this.attempts.delete(key);
      this.db.replace(this.db.users, { ...user, lastLoginAt: new Date().toISOString() });
      writeStoredUserId(user.id);
      return this.toSession(user);
    });
  }

  restore(): Observable<SessionUser | null> {
    const userId = readStoredUserId();
    const user = this.db.users.find((item) => item.id === userId && item.isActive);
    return of(user ? this.toSession(user) : null);
  }

  logout(): Observable<void> {
    writeStoredUserId(null);
    return of(undefined);
  }

  requestPasswordReset(_email: string): Observable<void> {
    return demoResponse(undefined);
  }

  private registerFailure(key: string, attempts: Attempts): void {
    const failures = attempts.failures + 1;
    this.attempts.set(key, {
      failures: failures >= MAX_FAILED_ATTEMPTS ? 0 : failures,
      lockedUntil: failures >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCK_MINUTES * 60_000 : null,
    });
  }

  private toSession(user: User): SessionUser {
    const assignments: RoleAssignment[] = this.db.userRoles
      .filter((role) => role.userId === user.id && role.revokedAt === null)
      .map((role) => ({
        role: role.role,
        scope: this.scopeOf(role.scope, role.denominationId, role.congregationId),
      }));

    const selectable = new Map<string, Scope>();
    for (const { scope } of assignments) {
      selectable.set(scopeKey(scope), scope);
      if (scope.kind === 'DENOMINATION') {
        for (const congregation of this.db.congregations) {
          if (congregation.denominationId === scope.denominationId && congregation.isActive) {
            const child = this.scopeOf('CONGREGATION', scope.denominationId, congregation.id);
            selectable.set(scopeKey(child), child);
          }
        }
      }
    }

    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      assignments,
      selectableScopes: [...selectable.values()],
    };
  }

  private scopeOf(kind: Scope['kind'], denominationId: number | null, congregationId: number | null): Scope {
    const denomination = this.db.denominations.find((item) => item.id === denominationId);
    const label =
      kind === 'PLATFORM'
        ? 'Plataforma'
        : kind === 'DENOMINATION'
          ? `Toda la denominación · ${denomination?.name ?? ''}`
          : (this.db.congregation(congregationId ?? 0)?.name ?? 'Sede');
    return { kind, denominationId, congregationId, label };
  }
}

function readStoredUserId(): number | null {
  try {
    const value = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return value === null ? null : Number(value);
  } catch {
    return null;
  }
}

function writeStoredUserId(userId: number | null): void {
  try {
    if (userId === null) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      sessionStorage.setItem(SESSION_STORAGE_KEY, String(userId));
    }
  } catch {
    // Storage blocked: the session simply does not survive a reload.
  }
}
