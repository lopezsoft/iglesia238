import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, map, tap } from 'rxjs';
import { DebugService } from '../debug/debug.service';
import { AccessTokenStore } from '../http/access-token.store';
import { AuthGateway, InvitationInfo } from './auth.gateway';
import { Permission } from './permission';
import { RoleCode } from './role';
import { Scope, SessionUser, TenantContext, scopeCovers, scopeKey } from './session.model';

/**
 * Session state: the signed-in user, the scope they act on (sede selector) and the
 * permissions that apply there. Permissions come from the API session (computed from the
 * database); UI checks are a convenience: the API enforces every rule on each request.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly gateway = inject(AuthGateway);
  private readonly router = inject(Router);
  private readonly debug = inject(DebugService);
  private readonly userState = signal<SessionUser | null>(null);
  private readonly activeScopeKey = signal<string | null>(null);
  private restored: Promise<void> | null = null;

  constructor() {
    // The refresh cookie was rejected (expired, revoked, signed out elsewhere): leave the app.
    inject(AccessTokenStore)
      .expired$.pipe(takeUntilDestroyed())
      .subscribe(() => this.endExpiredSession());
  }

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

  /** Assignments that apply in the active scope. */
  readonly activeAssignments = computed(() => {
    const user = this.userState();
    const scope = this.activeScope();
    return user && scope ? user.assignments.filter((a) => scopeCovers(a.scope, scope)) : [];
  });

  /** Display names of the roles that apply in the active scope. */
  readonly activeRoleNames = computed(() => [...new Set(this.activeAssignments().map((a) => a.roleName))]);

  /** Roles that apply in the active scope. */
  readonly activeRoles = computed<RoleCode[]>(() => [...new Set(this.activeAssignments().map((a) => a.role))]);

  readonly permissions = computed<ReadonlySet<Permission>>(
    () => new Set(this.activeAssignments().flatMap((assignment) => assignment.permissions)),
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

  confirmPasswordReset(token: string, newPassword: string): Observable<void> {
    return this.gateway.confirmPasswordReset(token, newPassword);
  }

  getInvitation(token: string): Observable<InvitationInfo> {
    return this.gateway.getInvitation(token);
  }

  acceptInvitation(token: string, password: string): Observable<void> {
    return this.gateway.acceptInvitation(token, password);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.gateway.changePassword(currentPassword, newPassword);
  }

  selectScope(scope: Scope): void {
    this.setActiveScopeKey(scopeKey(scope));
  }

  /**
   * Reads the roles and sedes again after they changed under the user's feet (a role granted or revoked,
   * a sede created or deactivated): the session is loaded at sign-in, so without this the menu and the
   * sede selector stay as they were until the next reload. A failure leaves the current session as is.
   */
  async refreshSession(): Promise<void> {
    if (!this.userState()) {
      return;
    }
    try {
      const user = await firstValueFrom(this.gateway.session());
      // Signed out while waiting: do not bring the session back.
      if (user && this.userState()) {
        this.start(user, this.activeScopeKey());
      }
    } catch (error) {
      this.debug.error('The session could not be refreshed', error);
    }
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

  private endExpiredSession(): void {
    if (!this.userState()) {
      return;
    }
    const returnUrl = this.router.url;
    this.userState.set(null);
    this.setActiveScopeKey(null);
    const canReturn = returnUrl !== '/' && !returnUrl.startsWith('/login');
    void this.router.navigate(['/login'], {
      queryParams: { reason: 'expired', ...(canReturn ? { returnUrl } : {}) },
    });
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
