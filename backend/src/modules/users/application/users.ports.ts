import type { Transaction } from '../../../common/persistence/transaction.js';
import type { ScopeKind } from '../../../common/tenancy/scope-key.js';

export const USER_DIRECTORY = Symbol('USER_DIRECTORY');
export const ROLE_CATALOG = Symbol('ROLE_CATALOG');
export const GRANT_SCOPE_READER = Symbol('GRANT_SCOPE_READER');
export const USER_LINK_STORE = Symbol('USER_LINK_STORE');
export const APP_LINKS = Symbol('APP_LINKS');

export type UserStatus = 'ACTIVE' | 'INVITATION_PENDING' | 'INACTIVE';

/** Which users and assignments an administrator may see: everything (platform) or one denomination. */
export type Visibility =
  | { readonly kind: 'PLATFORM' }
  | { readonly kind: 'DENOMINATION'; readonly denominationId: number };

export interface AssignmentRecord {
  readonly id: number;
  readonly userId: number;
  readonly roleCode: string;
  readonly scope: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly denominationName: string | null;
  readonly congregationName: string | null;
  readonly grantedById: number | null;
  readonly grantedByName: string | null;
  /** The grantor belongs to the platform team (their name is not shown to a denomination). */
  readonly grantedByPlatform: boolean;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export interface UserRecord {
  readonly id: number;
  readonly displayName: string | null;
  readonly email: string;
  readonly isActive: boolean;
  /** False while the invited person has not chosen a password. */
  readonly hasPassword: boolean;
  readonly lastLoginAt: Date | null;
  /** Only the assignments the viewer may see, newest first. */
  readonly assignments: readonly AssignmentRecord[];
  /** The account holds, or ever held (even revoked), roles the viewer cannot see (another denomination or the platform). */
  readonly hasHiddenAssignments: boolean;
}

export interface UserListFilter {
  readonly search: string;
  readonly role: string | null;
  readonly status: UserStatus | null;
  readonly page: number;
  readonly pageSize: number;
}

export interface NewAssignment {
  readonly userId: number;
  readonly roleCode: string;
  readonly scope: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly scopeKey: string;
  readonly grantedById: number;
}

export interface UserDirectory {
  list(
    visibility: Visibility,
    filter: UserListFilter,
  ): Promise<{ items: UserRecord[]; total: number }>;
  /** A user as the viewer sees it, or null when it does not exist or is outside the viewer's reach. */
  findVisible(
    visibility: Visibility,
    userId: number,
  ): Promise<UserRecord | null>;
  /** Looks an account up by e-mail across the whole platform (to link instead of duplicating it). */
  findIdByEmail(email: string): Promise<number | null>;
  createInvitedUser(
    data: { email: string; displayName: string },
    transaction: Transaction,
  ): Promise<number>;
  findAssignment(
    visibility: Visibility,
    assignmentId: number,
  ): Promise<AssignmentRecord | null>;
  /** The role is already active on that scope (same user, role and scope key). */
  hasActiveAssignment(
    userId: number,
    roleCode: string,
    scopeKey: string,
  ): Promise<boolean>;
  insertAssignment(
    assignment: NewAssignment,
    transaction: Transaction,
  ): Promise<number>;
  revokeAssignment(
    assignmentId: number,
    revokedAt: Date,
    transaction: Transaction,
  ): Promise<void>;
}

export interface RoleRecord {
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: readonly { code: string; description: string | null }[];
}

export interface RoleCatalog {
  list(): Promise<RoleRecord[]>;
  exists(code: string): Promise<boolean>;
}

export interface ScopeDenomination {
  readonly id: number;
  readonly name: string;
}

export interface ScopeCongregation {
  readonly id: number;
  readonly name: string;
  readonly denominationId: number;
  readonly denominationName: string;
}

/** Active denominations and congregations a role can be granted on. */
export interface GrantScopeReader {
  findActiveDenomination(id: number): Promise<ScopeDenomination | null>;
  findActiveCongregation(id: number): Promise<ScopeCongregation | null>;
  listActiveDenominations(): Promise<ScopeDenomination[]>;
  /** Active congregations of active denominations; of one denomination when given. */
  listActiveCongregations(
    denominationId: number | null,
  ): Promise<ScopeCongregation[]>;
  findDenominationName(id: number): Promise<string | null>;
}

export type LinkPurpose = 'INVITATION' | 'PASSWORD_RESET';

/** One-time links (user_tokens). Issuing a link replaces any link of the same kind still open. */
export interface UserLinkStore {
  replaceLink(
    link: {
      userId: number;
      purpose: LinkPurpose;
      tokenHash: string;
      expiresAt: Date;
    },
    now: Date,
    transaction: Transaction,
  ): Promise<void>;
}

export interface AppLinks {
  invitation(token: string): string;
  passwordReset(token: string): string;
}
