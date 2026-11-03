import { Observable } from 'rxjs';
import { Page } from '../../../../shared/utils/pagination';
import {
  GrantContext,
  GrantRoleCommand,
  InvitationResult,
  InviteUserCommand,
  ManagedUser,
  OneTimeLink,
  RoleAssignmentView,
  RoleMatrix,
  UserQuery,
} from './user-roles.models';

/**
 * Port to the users and roles API. Every operation is scoped to the active tenant: a
 * platform admin sees every user, a denomination admin only users with a role in it.
 * A role change applies at once: the API computes permissions on every request.
 */
export abstract class UserRolesRepository {
  /** Server-side search, role and status filters, and pagination. */
  abstract listUsers(query: UserQuery): Observable<Page<ManagedUser>>;

  /** Roles and scopes the active administrator may grant. */
  abstract grantContext(): Observable<GrantContext>;

  /** Roles with their permissions (the matrix shown on the roles tab). */
  abstract roleMatrix(): Observable<RoleMatrix>;

  /** Fails with 'DUPLICATE_ROLE' when the same role is already active on that scope. */
  abstract grantRole(command: GrantRoleCommand): Observable<RoleAssignmentView>;

  /** Sets revokedAt (the row is kept). Fails with 'SELF_REVOKE' on your own admin role. */
  abstract revokeRole(assignmentId: number): Observable<RoleAssignmentView>;

  /**
   * Creates the user with a pending invitation and a first role, and returns the one-time link.
   * When the email belongs to an account outside the administrator's tenant, the role is linked to
   * that account instead (invite-or-link) and no link is returned. 'DUPLICATE_EMAIL' only when the
   * user is already listed for the administrator.
   */
  abstract inviteUser(command: InviteUserCommand): Observable<InvitationResult>;

  /** New one-time link: the invitation again for a pending user, a recovery link for the rest. */
  abstract issueLink(userId: number): Observable<OneTimeLink>;
}
