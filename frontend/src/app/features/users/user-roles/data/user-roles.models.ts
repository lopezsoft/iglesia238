// Users and role assignments (A-04), mirroring User and UserRole of
// backend/prisma/schema/identity.prisma. Only the fields the screen needs.
import { ROLE_NAMES, RoleCode } from '../../../../core/auth/role';
import { ScopeKind } from '../../../../core/auth/session.model';

export type UserStatus = 'ACTIVE' | 'INVITATION_PENDING' | 'INACTIVE';

export const USER_STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  ACTIVE: 'Activo',
  INVITATION_PENDING: 'Invitación pendiente',
  INACTIVE: 'Inactivo',
};

export const USER_STATUS_OPTIONS: readonly { value: UserStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'INVITATION_PENDING', label: 'Pendientes' },
  { value: 'INACTIVE', label: 'Inactivos' },
];

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

/** Filters and page of the users list; the server applies all of them. */
export interface UserQuery {
  readonly search: string;
  readonly role: RoleCode | '';
  readonly status: UserStatus | '';
  readonly page: number;
  readonly pageSize: number;
}

export type LinkPurpose = 'INVITATION' | 'PASSWORD_RESET';

/** A one-time link (invitation or password recovery). Shown once, to the administrator who asked. */
export interface OneTimeLink {
  readonly link: string;
  readonly expiresAt: string;
  readonly purpose: LinkPurpose;
  /** True when the API also e-mailed it; false means the administrator must pass it on. */
  readonly emailDelivered: boolean;
}

export interface InvitationResult {
  readonly user: ManagedUser;
  readonly invitation: OneTimeLink;
}

export interface RoleMatrixRow {
  readonly code: RoleCode;
  readonly name: string;
  readonly description: string | null;
  readonly scopeKind: ScopeKind | null;
  readonly permissions: readonly string[];
}

/** Roles with the permissions each one grants, read from the database. */
export interface RoleMatrix {
  readonly roles: readonly RoleMatrixRow[];
  readonly permissions: readonly { code: string; description: string | null }[];
}

/** Roles that let a user manage users: revoking your own would lock you out. */
export const ADMIN_ROLES: readonly RoleCode[] = ['PLATFORM_ADMIN', 'DENOMINATION_ADMIN'];

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
  return activeAssignments(user).some(
    (active) =>
      active.role === assignment.role &&
      active.scope === assignment.scope &&
      active.denominationId === assignment.denominationId &&
      active.congregationId === assignment.congregationId,
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
