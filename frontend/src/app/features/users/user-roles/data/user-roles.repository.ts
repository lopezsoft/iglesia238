import { Observable } from 'rxjs';
import {
  GrantContext,
  GrantRoleCommand,
  InviteUserCommand,
  ManagedUser,
  RoleAssignmentView,
} from './user-roles.models';

/**
 * Port to the users and roles API. Every operation is scoped to the active tenant: a
 * platform admin sees every user, a denomination admin only users with a role in it.
 * Role changes apply on the user's next sign-in.
 */
export abstract class UserRolesRepository {
  abstract listUsers(): Observable<ManagedUser[]>;

  /** Roles and scopes the active administrator may grant. */
  abstract grantContext(): Observable<GrantContext>;

  /** Fails with 'DUPLICATE_ROLE' when the same role is already active on that scope. */
  abstract grantRole(command: GrantRoleCommand): Observable<RoleAssignmentView>;

  /** Sets revokedAt (the row is kept). Fails with 'SELF_REVOKE' on your own admin role. */
  abstract revokeRole(assignmentId: number): Observable<RoleAssignmentView>;

  /**
   * Creates the user with a pending invitation and a first role. When the email belongs to an
   * account outside the administrator's tenant, the role is linked to that account instead
   * (invite-or-link), so its existence is not disclosed. 'DUPLICATE_EMAIL' only when the user
   * is already listed for the administrator.
   */
  abstract inviteUser(command: InviteUserCommand): Observable<ManagedUser>;
}
