// Identity context, mirroring backend/prisma/schema/identity.prisma (never password hashes).
import { RoleCode } from '../auth/role';
import { ScopeKind } from '../auth/session.model';

export interface User {
  readonly id: number;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly lastLoginAt: string | null;
  /** True while the invited user has not set a password yet. */
  readonly invitationPending: boolean;
}

export interface UserRoleAssignment {
  readonly id: number;
  readonly userId: number;
  readonly role: RoleCode;
  readonly scope: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly grantedById: number | null;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

/** A changed field: the API never stores personal data in `changes`. */
export interface AuditChange {
  readonly from: string | number | boolean | null;
  readonly to: string | number | boolean | null;
}

export interface AuditLogEntry {
  readonly id: number;
  readonly userId: number | null;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly entity: string;
  readonly entityId: string;
  readonly action: string;
  readonly changes: Readonly<Record<string, AuditChange>> | null;
  readonly ipAddress: string | null;
  readonly createdAt: string;
}
