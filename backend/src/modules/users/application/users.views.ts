import {
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from '../../../common/mappers/value-mappers.js';
import type { ScopeKind } from '../../../common/tenancy/scope-key.js';
import type { UserManager } from './role-policy.js';
import type {
  AssignmentRecord,
  UserRecord,
  UserStatus,
} from './users.ports.js';

export interface AssignmentView {
  readonly id: number;
  readonly role: string;
  readonly scope: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly scopeLabel: string;
  readonly grantedByName: string | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface ManagedUserView {
  readonly id: number;
  readonly displayName: string;
  readonly email: string;
  readonly status: UserStatus;
  readonly lastLoginAt: string | null;
  /** The administrator who is looking. */
  readonly isSelf: boolean;
  /** Active and revoked assignments the administrator may see, newest first. */
  readonly assignments: readonly AssignmentView[];
}

export const PLATFORM_TEAM_LABEL = 'Equipo de plataforma';

export function statusOf(
  user: Pick<UserRecord, 'isActive' | 'hasPassword'>,
): UserStatus {
  if (!user.isActive) {
    return 'INACTIVE';
  }
  return user.hasPassword ? 'ACTIVE' : 'INVITATION_PENDING';
}

function scopeLabelOf(record: AssignmentRecord, manager: UserManager): string {
  switch (record.scope) {
    case 'PLATFORM':
      return 'Plataforma';
    case 'DENOMINATION':
      return manager.isPlatformAdmin
        ? `Toda la denominación · ${record.denominationName ?? ''}`.trim()
        : 'Toda la denominación';
    case 'CONGREGATION': {
      const name = record.congregationName ?? 'Sede';
      return manager.isPlatformAdmin && record.denominationName
        ? `${name} · ${record.denominationName}`
        : name;
    }
  }
}

/**
 * A denomination administrator does not learn the name of a platform team member who granted a role:
 * the platform team is shown as one party.
 */
function grantorLabel(
  record: AssignmentRecord,
  manager: UserManager,
): string | null {
  if (record.grantedById === null) {
    return null;
  }
  if (manager.isPlatformAdmin || record.grantedById === manager.userId) {
    return record.grantedByName;
  }
  return record.grantedByPlatform ? PLATFORM_TEAM_LABEL : record.grantedByName;
}

export function toAssignmentView(
  record: AssignmentRecord,
  manager: UserManager,
): AssignmentView {
  return {
    id: record.id,
    role: record.roleCode,
    scope: record.scope,
    denominationId: record.denominationId,
    congregationId: record.congregationId,
    scopeLabel: scopeLabelOf(record, manager),
    grantedByName: grantorLabel(record, manager),
    createdAt: toIsoDateTime(record.createdAt),
    revokedAt: toIsoDateTimeOrNull(record.revokedAt),
  };
}

export function toManagedUserView(
  record: UserRecord,
  manager: UserManager,
): ManagedUserView {
  return {
    id: record.id,
    displayName: record.displayName?.trim() || record.email,
    email: record.email,
    status: statusOf(record),
    lastLoginAt: toIsoDateTimeOrNull(record.lastLoginAt),
    isSelf: record.id === manager.userId,
    assignments: record.assignments.map((assignment) =>
      toAssignmentView(assignment, manager),
    ),
  };
}
