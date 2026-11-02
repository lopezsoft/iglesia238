import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, map, tap } from 'rxjs';
import { AuthGateway } from './auth.gateway';
import { Permission } from './permission';
import { ROLE_PERMISSIONS, RoleCode } from './role';
import { Scope, SessionUser, TenantContext, scopeCovers, scopeKey } from './session.model';

/**
 * Session state: the signed-in user, the scope they act on (sede selector) and the
 * permissions that apply there. UI checks are a convenience: the API enforces every rule.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly gateway = inject(AuthGateway);
  private readonly userState = signal<SessionUser | null>(null);
  private readonly activeScopeKey = signal<string | null>(null);
  private restored: Promise<void> | null = null;

  readonly user = this.userState.asReadonly();
  readonly isAuthenticated = computed(() => this.userState() !== null);

  readonly activeScope = computed<Scope | null>(() => {
    const user = this.userState();
    if (!user) {
      return null;
    }
    const key = this.activeScopeKey();
    return user.selectableScopes.find((scope) => scopeKey(scope) === key) ?? user.selectableScopes[0] ?? null;
  });

  /** Roles that apply in the active scope. */
  readonly activeRoles = computed<RoleCode[]>(() => {
    const user = this.userState();
    const scope = this.activeScope();
    if (!user || !scope) {
      return [];
    }
    return [...new Set(user.assignments.filter((a) => scopeCovers(a.scope, scope)).map((a) => a.role))];
  });

  readonly permissions = computed<ReadonlySet<Permission>>(
    () => new Set(this.activeRoles().flatMap((role) => ROLE_PERMISSIONS[role])),
  );

  readonly tenant = computed<TenantContext>(() => {
    const scope = this.activeScope();
    return {
      denominationId: scope?.denominationId ?? null,
      congregationId: scope?.congregationId ?? null,
    };
  });

  can(permission: Permission): boolean {
    return this.permissions().has(permission);
  }

  canAny(permissions: readonly Permission[]): boolean {
    return permissions.length === 0 || permissions.some((permission) => this.can(permission));
  }

  login(email: string, password: string): Observable<SessionUser> {
    return this.gateway.login(email, password).pipe(tap((user) => this.start(user, null)));
  }

  logout(): Observable<void> {
    return this.gateway.logout().pipe(
      map(() => {
        this.userState.set(null);
        this.setActiveScopeKey(null);
      }),
    );
  }

  requestPasswordReset(email: string): Observable<void> {
    return this.gateway.requestPasswordReset(email);
  }

  selectScope(scope: Scope): void {
    this.setActiveScopeKey(scopeKey(scope));
  }

  /** Restores the session once, with the sede chosen before the reload; guards await it. */
  ensureRestored(): Promise<void> {
    this.restored ??= firstValueFrom(this.gateway.restore()).then(
      (user) => {
        if (user && !this.userState()) {
          this.start(user, readStoredScopeKey());
        }
      },
      () => undefined,
    );
    return this.restored;
  }

  /** Starts acting on `preferredKey` when the user still has that scope, else on the first one. */
  private start(user: SessionUser, preferredKey: string | null): void {
    const keys = user.selectableScopes.map(scopeKey);
    this.userState.set(user);
    this.setActiveScopeKey(preferredKey !== null && keys.includes(preferredKey) ? preferredKey : (keys[0] ?? null));
  }

  private setActiveScopeKey(key: string | null): void {
    this.activeScopeKey.set(key);
    writeStoredScopeKey(key);
  }
}

/** The active scope survives a reload of the tab (not a new tab), like the session itself. */
const ACTIVE_SCOPE_STORAGE_KEY = 'iglesia238.activeScope';

function readStoredScopeKey(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_SCOPE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredScopeKey(key: string | null): void {
  try {
    if (key === null) {
      sessionStorage.removeItem(ACTIVE_SCOPE_STORAGE_KEY);
    } else {
      sessionStorage.setItem(ACTIVE_SCOPE_STORAGE_KEY, key);
    }
  } catch {
    // Storage blocked: after a reload the session starts again on the first scope.
  }
}
