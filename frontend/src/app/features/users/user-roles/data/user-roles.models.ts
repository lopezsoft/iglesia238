// Users and role assignments (A-04), mirroring User and UserRole of
// backend/prisma/schema/identity.prisma. Only the fields the screen needs.
import { ROLE_NAMES, RoleCode } from '../../../../core/auth/role';
import { ScopeKind } from '../../../../core/auth/session.model';
import { matchesText } from '../../../../shared/utils/pagination';

export type UserStatus = 'ACTIVE' | 'INVITATION_PENDING' | 'INACTIVE';

export const USER_STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  ACTIVE: 'Activo',
  INVITATION_PENDING: 'Invitación pendiente',
  INACTIVE: 'Inactivo',
};

export const USER_STATUS_TONES: Readonly<Record<UserStatus, 'success' | 'warning' | 'neutral'>> = {
  ACTIVE: 'success',
  INVITATION_PENDING: 'warning',
  INACTIVE: 'neutral',
};

/** A UserRole row as the administrator sees it (grantor resolved to a display name). */
export interface RoleAssignmentView {
  readonly id: number;
  readonly role: RoleCode;
  readonly scope: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly scopeLabel: string;
  readonly grantedByName: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface ManagedUser {
  readonly id: number;
  readonly displayName: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly lastLoginAt: string | null;
  /** The signed-in administrator. */
  readonly isSelf: boolean;
  /** Active and revoked assignments visible to the administrator, newest first. */
  readonly assignments: readonly RoleAssignmentView[];
}

/** A scope the administrator may grant a role on. */
export interface ScopeOption {
  readonly kind: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly label: string;
}

export interface GrantableRole {
  readonly role: RoleCode;
  readonly scopes: readonly ScopeOption[];
}

/** What the active administrator may do: drives the role and scope selectors. */
export interface GrantContext {
  readonly isPlatformAdmin: boolean;
  /** "Iglesia Cristiana Monte de Sion" or "Plataforma". */
  readonly audienceLabel: string;
  readonly roles: readonly GrantableRole[];
}

export interface GrantRoleCommand {
  readonly userId: number;
  readonly role: RoleCode;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
}

export interface InviteUserCommand {
  readonly displayName: string;
  readonly email: string;
  readonly role: RoleCode;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
}

export interface UserFilter {
  readonly search: string;
  readonly role: RoleCode | '';
}

/** Roles that let a user manage users: revoking your own would lock you out. */
export const ADMIN_ROLES: readonly RoleCode[] = ['PLATFORM_ADMIN', 'DENOMINATION_ADMIN'];

/** Scope kind each role is granted on (mirrors the backend rule). */
export const ROLE_SCOPE_KIND: Readonly<Record<RoleCode, ScopeKind>> = {
  PLATFORM_ADMIN: 'PLATFORM',
  DENOMINATION_ADMIN: 'DENOMINATION',
  PASTOR: 'CONGREGATION',
  SECRETARY: 'CONGREGATION',
  TREASURER: 'CONGREGATION',
};

/** Mirrors UserRole.scopeKey: "P", "D:<denominationId>" or "C:<congregationId>". */
export function roleScopeKey(scope: Pick<ScopeOption, 'kind' | 'denominationId' | 'congregationId'>): string {
  switch (scope.kind) {
    case 'PLATFORM':
      return 'P';
    case 'DENOMINATION':
      return `D:${scope.denominationId ?? ''}`;
    case 'CONGREGATION':
      return `C:${scope.congregationId ?? ''}`;
  }
}

/** yyyy-MM-dd of the local calendar day (toISOString().slice(0, 10) would give the UTC day). */
export function localIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function activeAssignments(user: ManagedUser): RoleAssignmentView[] {
  return user.assignments.filter((assignment) => assignment.revokedAt === null);
}

export function revokedAssignments(user: ManagedUser): RoleAssignmentView[] {
  return user.assignments.filter((assignment) => assignment.revokedAt !== null);
}

export function assignmentLabel(assignment: Pick<RoleAssignmentView, 'role' | 'scopeLabel'>): string {
  return `${ROLE_NAMES[assignment.role]} · ${assignment.scopeLabel}`;
}

/** True while the user holds the same role on the same scope (a regrant would duplicate it). */
export function hasActiveEquivalent(user: ManagedUser, assignment: RoleAssignmentView): boolean {
  const key = roleScopeKey({ ...assignment, kind: assignment.scope });
  return activeAssignments(user).some(
    (active) => active.role === assignment.role && roleScopeKey({ ...active, kind: active.scope }) === key,
  );
}

export function filterUsers(users: readonly ManagedUser[], filter: UserFilter): ManagedUser[] {
  return users.filter(
    (user) =>
      matchesText([user.displayName, user.email], filter.search) &&
      (filter.role === '' || activeAssignments(user).some((assignment) => assignment.role === filter.role)),
  );
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}

/** Serialized scope for a <select> value. */
export function scopeValue(scope: Pick<ScopeOption, 'kind' | 'denominationId' | 'congregationId'>): string {
  return `${scope.kind}:${scope.denominationId ?? ''}:${scope.congregationId ?? ''}`;
}

export function findScope(role: GrantableRole | undefined, value: string): ScopeOption | undefined {
  return role?.scopes.find((scope) => scopeValue(scope) === value);
}
