import { ScopeKind } from './scope-key.js';

export interface RoleAssignmentView {
  readonly roleCode: string;
  readonly kind: ScopeKind;
  readonly scopeKey: string;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly permissions: readonly string[];
}

export interface UserAccess {
  readonly userId: number;
  /** False when the account was disabled or deleted after the token was issued. */
  readonly isActive: boolean;
  /** Only assignments that are not revoked. */
  readonly assignments: readonly RoleAssignmentView[];
}

/** Reads the source of truth for authorization: the active role assignments of a user. */
export interface AssignmentsReader {
  loadAccess(userId: number): Promise<UserAccess | null>;
  /** Denomination of a congregation, read from the database and never trusted from the client. */
  findCongregationDenominationId(
    congregationId: number,
  ): Promise<number | null>;
}

export const ASSIGNMENTS_READER = Symbol('ASSIGNMENTS_READER');
