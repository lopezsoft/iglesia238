import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
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
import { UserRolesRepository } from './user-roles.repository';

/** Adapter over `/api/users`, `/api/user-roles` and `/api/roles`. */
@Injectable()
export class HttpUserRolesRepository extends UserRolesRepository {
  private readonly http = inject(HttpClient);

  override listUsers(query: UserQuery): Observable<Page<ManagedUser>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    const search = query.search.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (query.role) {
      params = params.set('role', query.role);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }
    return this.http.get<Page<ManagedUser>>(apiUrl('/users'), { params });
  }

  override grantContext(): Observable<GrantContext> {
    return this.http.get<GrantContext>(apiUrl('/users/grant-context'));
  }

  override roleMatrix(): Observable<RoleMatrix> {
    return this.http.get<RoleMatrix>(apiUrl('/roles'));
  }

  override grantRole(command: GrantRoleCommand): Observable<RoleAssignmentView> {
    const { userId, ...body } = command;
    return this.http.post<RoleAssignmentView>(apiUrl(`/users/${userId}/roles`), body);
  }

  override revokeRole(assignmentId: number): Observable<RoleAssignmentView> {
    return this.http.post<RoleAssignmentView>(apiUrl(`/user-roles/${assignmentId}/revoke`), {});
  }

  override inviteUser(command: InviteUserCommand): Observable<InvitationResult> {
    return this.http.post<InvitationResult>(apiUrl('/users/invitations'), command);
  }

  override issueLink(userId: number): Observable<OneTimeLink> {
    return this.http.post<OneTimeLink>(apiUrl(`/users/${userId}/reset-link`), {});
  }
}
