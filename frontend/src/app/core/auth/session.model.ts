import { Permission } from './permission';
import { RoleCode } from './role';

/** Mirrors the RoleScope enum of the backend. */
export type ScopeKind = 'PLATFORM' | 'DENOMINATION' | 'CONGREGATION';

/** Where a role applies. Denomination and congregation ids are null when they do not apply. */
export interface Scope {
  readonly kind: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly label: string;
}

export interface RoleAssignment {
  readonly role: RoleCode;
  /** Display name of the role (Role.name). */
  readonly roleName: string;
  /** Permissions the role grants, as computed by the API from the database. */
  readonly permissions: readonly Permission[];
  readonly scope: Scope;
}

export interface SessionUser {
  readonly id: number;
  readonly displayName: string;
  readonly email: string;
  /**
   * False until the person confirms the address from the e-mailed link. The app stays locked on the
   * "Confirma tu correo" page meanwhile; the API answers 403 EMAIL_NOT_VERIFIED to every domain call.
   */
  readonly emailVerified: boolean;
  readonly assignments: readonly RoleAssignment[];
  /**
   * Scopes the user can act on: the scope of each assignment plus, for denomination-wide
   * roles, each congregation of that denomination.
   */
  readonly selectableScopes: readonly Scope[];
}

/** Tenant of the current request, the frontend counterpart of the API TenantContext. */
export interface TenantContext {
  readonly denominationId: number | null;
  readonly congregationId: number | null;
}

export function scopeKey(scope: Scope): string {
  return `${scope.kind}:${scope.denominationId ?? '-'}:${scope.congregationId ?? '-'}`;
}

/**
 * Value of the `X-Scope` header (the `UserRole.scopeKey` of the API): `P` for the platform,
 * `D:<denominationId>` for a denomination and `C:<congregationId>` for a congregation.
 * The API validates it on every request against the user's active roles.
 */
export function scopeHeader(scope: Scope): string {
  switch (scope.kind) {
    case 'PLATFORM':
      return 'P';
    case 'DENOMINATION':
      return `D:${scope.denominationId}`;
    case 'CONGREGATION':
      return `C:${scope.congregationId}`;
  }
}

/** True when a role granted on `granted` applies while acting on `active`. */
export function scopeCovers(granted: Scope, active: Scope): boolean {
  switch (granted.kind) {
    case 'PLATFORM':
      return active.kind === 'PLATFORM';
    case 'DENOMINATION':
      return active.kind !== 'PLATFORM' && active.denominationId === granted.denominationId;
    case 'CONGREGATION':
      return active.kind === 'CONGREGATION' && active.congregationId === granted.congregationId;
  }
}
