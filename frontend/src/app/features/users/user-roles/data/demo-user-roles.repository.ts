import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { RoleCode } from '../../../../core/auth/role';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { User, UserRoleAssignment } from '../../../../core/models/identity.model';
import {
  ADMIN_ROLES,
  GrantContext,
  GrantRoleCommand,
  GrantableRole,
  InviteUserCommand,
  ManagedUser,
  ROLE_SCOPE_KIND,
  RoleAssignmentView,
  ScopeOption,
  UserStatus,
  localIsoDate,
  roleScopeKey,
} from './user-roles.models';
import { UserRolesRepository } from './user-roles.repository';

/** Who is acting: a platform admin (no tenant) or the admin of one denomination. */
interface Actor {
  readonly userId: number;
  readonly isPlatformAdmin: boolean;
  readonly denominationId: number | null;
}

type ResolvedScope = Pick<UserRoleAssignment, 'scope' | 'denominationId' | 'congregationId'>;

const CONGREGATION_ROLES: readonly RoleCode[] = ['PASTOR', 'SECRETARY', 'TREASURER'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 150;

/** Demo adapter: simulates the API rules on the shared in-memory tables. */
@Injectable()
export class DemoUserRolesRepository extends UserRolesRepository {
  private readonly db = inject(DemoDatabase);
  private readonly auth = inject(AuthService);

  listUsers(): Observable<ManagedUser[]> {
    return demoCommand(() => {
      const actor = this.actor();
      return this.db.users
        .filter((user) => actor.isPlatformAdmin || this.visibleRolesOf(user.id, actor).length > 0)
        .map((user) => this.toManagedUser(user, actor))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
    });
  }

  grantContext(): Observable<GrantContext> {
    return demoCommand(() => {
      const actor = this.actor();
      return actor.isPlatformAdmin ? this.platformContext() : this.denominationContext(actor);
    });
  }

  grantRole(command: GrantRoleCommand): Observable<RoleAssignmentView> {
    return demoCommand(() => {
      const actor = this.actor();
      const user = this.db.users.find((item) => item.id === command.userId);
      if (!user || (!actor.isPlatformAdmin && this.visibleRolesOf(user.id, actor).length === 0)) {
        throw new DomainError('NOT_FOUND', 'El usuario no existe o no pertenece a tu denominación.');
      }
      const scope = this.resolveScope(actor, command);
      const row = this.insertRole(actor, user.id, command.role, scope);
      return this.toView(row, actor);
    });
  }

  revokeRole(assignmentId: number): Observable<RoleAssignmentView> {
    return demoCommand(() => {
      const actor = this.actor();
      const row = this.db.userRoles.find((item) => item.id === assignmentId);
      if (!row || !this.isVisible(row, actor)) {
        throw new DomainError('NOT_FOUND', 'La asignación no existe o no pertenece a tu denominación.');
      }
      if (row.revokedAt !== null) {
        throw new DomainError('ALREADY_REVOKED', 'Esta asignación ya estaba revocada.');
      }
      if (row.userId === actor.userId && ADMIN_ROLES.includes(row.role)) {
        throw new DomainError(
          'SELF_REVOKE',
          'No puedes revocar tu propio rol de administrador: perderías el acceso a esta pantalla.',
        );
      }
      const revokedAt = new Date().toISOString();
      const revoked = this.db.replace(this.db.userRoles, { ...row, revokedAt });
      this.db.audit({
        userId: actor.userId,
        denominationId: row.denominationId,
        congregationId: row.congregationId,
        entity: 'UserRole',
        entityId: String(row.id),
        action: 'ROLE_REVOKED',
        changes: {
          role: { from: row.role, to: row.role },
          revokedAt: { from: null, to: localIsoDate(new Date(revokedAt)) },
        },
      });
      return this.toView(revoked, actor);
    });
  }

  inviteUser(command: InviteUserCommand): Observable<ManagedUser> {
    return demoCommand(() => {
      const actor = this.actor();
      const displayName = command.displayName.trim().replace(/\s+/g, ' ');
      const email = command.email.trim().toLowerCase();
      if (displayName.length < 3 || displayName.length > MAX_NAME_LENGTH) {
        throw new DomainError('INVALID_NAME', 'Escribe el nombre completo de la persona.');
      }
      if (!EMAIL_PATTERN.test(email)) {
        throw new DomainError('INVALID_EMAIL', 'Escribe un correo electrónico válido.');
      }
      const existing = this.db.users.find((user) => user.email === email);
      if (existing && (actor.isPlatformAdmin || this.visibleRolesOf(existing.id, actor).length > 0)) {
        // Already listed for this administrator: nothing is disclosed by saying so.
        throw new DomainError('DUPLICATE_EMAIL', 'Ya existe un usuario con ese correo electrónico.');
      }
      const scope = this.resolveScope(actor, command);
      if (existing) {
        // Invite-or-link: the account lives outside this tenant. Instead of revealing that (and
        // leaving no way to grant it a role), the first role is linked to the existing account.
        this.insertRole(actor, existing.id, command.role, scope);
        return this.toManagedUser(existing, actor);
      }

      const user: User = {
        id: this.db.nextId(this.db.users),
        email,
        displayName,
        isActive: true,
        lastLoginAt: null,
        invitationPending: true,
      };
      this.db.users.push(user);
      this.db.audit({
        userId: actor.userId,
        denominationId: scope.denominationId,
        congregationId: scope.congregationId,
        entity: 'User',
        entityId: String(user.id),
        action: 'USER_INVITED',
        changes: {
          invitationPending: { from: null, to: true },
          role: { from: null, to: command.role },
        },
      });
      this.insertRole(actor, user.id, command.role, scope);
      return this.toManagedUser(user, actor);
    });
  }

  /** Resolves the acting administrator, or rejects the request (the API would answer 403). */
  private actor(): Actor {
    const user = this.auth.user();
    if (!user || !this.auth.can('users.manage')) {
      throw new DomainError('FORBIDDEN', 'No tienes permiso para gestionar usuarios y roles.');
    }
    const roles = this.auth.activeRoles();
    if (this.auth.activeScope()?.kind === 'PLATFORM' && roles.includes('PLATFORM_ADMIN')) {
      return { userId: user.id, isPlatformAdmin: true, denominationId: null };
    }
    const { denominationId } = this.auth.tenant();
    if (denominationId === null || !roles.includes('DENOMINATION_ADMIN')) {
      throw new DomainError('FORBIDDEN', 'No tienes permiso para gestionar usuarios y roles.');
    }
    return { userId: user.id, isPlatformAdmin: false, denominationId };
  }

  private isVisible(row: UserRoleAssignment, actor: Actor): boolean {
    return actor.isPlatformAdmin || row.denominationId === actor.denominationId;
  }

  private visibleRolesOf(userId: number, actor: Actor): UserRoleAssignment[] {
    return this.db.userRoles.filter((row) => row.userId === userId && this.isVisible(row, actor));
  }

  /** Validates the scope of a role for the actor and normalizes its ids (mirrors scopeKey). */
  private resolveScope(
    actor: Actor,
    command: Pick<GrantRoleCommand, 'role' | 'denominationId' | 'congregationId'>,
  ): ResolvedScope {
    switch (ROLE_SCOPE_KIND[command.role]) {
      case 'PLATFORM':
        if (!actor.isPlatformAdmin) {
          throw new DomainError(
            'FORBIDDEN',
            'Solo el equipo de plataforma puede otorgar el rol Administrador de plataforma.',
          );
        }
        return { scope: 'PLATFORM', denominationId: null, congregationId: null };
      case 'DENOMINATION': {
        const denominationId = actor.isPlatformAdmin ? command.denominationId : actor.denominationId;
        if (!actor.isPlatformAdmin && command.denominationId !== null && command.denominationId !== actor.denominationId) {
          throw new DomainError('FORBIDDEN', 'Solo puedes otorgar roles dentro de tu denominación.');
        }
        const denomination = this.db.denominations.find((item) => item.id === denominationId && item.isActive);
        if (!denomination) {
          throw new DomainError('INVALID_SCOPE', 'Selecciona una denominación activa.');
        }
        return { scope: 'DENOMINATION', denominationId: denomination.id, congregationId: null };
      }
      case 'CONGREGATION': {
        if (command.congregationId === null) {
          throw new DomainError('SCOPE_REQUIRED', 'Selecciona la sede en la que aplica el rol.');
        }
        const congregation = this.db.congregation(command.congregationId);
        if (!congregation || !congregation.isActive) {
          throw new DomainError('INVALID_SCOPE', 'Selecciona una sede activa.');
        }
        if (!actor.isPlatformAdmin && congregation.denominationId !== actor.denominationId) {
          throw new DomainError('FORBIDDEN', 'Solo puedes otorgar roles dentro de tu denominación.');
        }
        return { scope: 'CONGREGATION', denominationId: congregation.denominationId, congregationId: congregation.id };
      }
    }
  }

  private insertRole(actor: Actor, userId: number, role: RoleCode, scope: ResolvedScope): UserRoleAssignment {
    const key = roleScopeKey({ ...scope, kind: scope.scope });
    const duplicate = this.db.userRoles.some(
      (row) =>
        row.userId === userId &&
        row.role === role &&
        row.revokedAt === null &&
        roleScopeKey({ ...row, kind: row.scope }) === key,
    );
    if (duplicate) {
      throw new DomainError('DUPLICATE_ROLE', 'El usuario ya tiene ese rol activo en ese alcance.');
    }
    const row: UserRoleAssignment = {
      id: this.db.nextId(this.db.userRoles),
      userId,
      role,
      ...scope,
      grantedById: actor.userId,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    this.db.userRoles.push(row);
    this.db.audit({
      userId: actor.userId,
      denominationId: row.denominationId,
      congregationId: row.congregationId,
      entity: 'UserRole',
      entityId: String(row.id),
      action: 'ROLE_GRANTED',
      changes: { role: { from: null, to: role }, scopeKey: { from: null, to: key } },
    });
    return row;
  }

  private platformContext(): GrantContext {
    const denominations = this.db.denominations.filter((item) => item.isActive);
    const congregationScopes: ScopeOption[] = this.db.congregations
      .filter((item) => item.isActive && denominations.some((d) => d.id === item.denominationId))
      .map((item) => ({
        kind: 'CONGREGATION',
        denominationId: item.denominationId,
        congregationId: item.id,
        label: `${item.name} · ${this.denominationName(item.denominationId)}`,
      }));
    const roles: GrantableRole[] = [
      { role: 'PLATFORM_ADMIN', scopes: [{ kind: 'PLATFORM', denominationId: null, congregationId: null, label: 'Plataforma' }] },
      {
        role: 'DENOMINATION_ADMIN',
        scopes: denominations.map((item) => ({
          kind: 'DENOMINATION',
          denominationId: item.id,
          congregationId: null,
          label: `Toda la denominación · ${item.name}`,
        })),
      },
      ...CONGREGATION_ROLES.map((role) => ({ role, scopes: congregationScopes })),
    ];
    return { isPlatformAdmin: true, audienceLabel: 'Plataforma', roles };
  }

  private denominationContext(actor: Actor): GrantContext {
    const congregationScopes: ScopeOption[] = this.db.congregations
      .filter((item) => item.isActive && item.denominationId === actor.denominationId)
      .map((item) => ({ kind: 'CONGREGATION', denominationId: item.denominationId, congregationId: item.id, label: item.name }));
    const roles: GrantableRole[] = [
      {
        role: 'DENOMINATION_ADMIN',
        scopes: [{ kind: 'DENOMINATION', denominationId: actor.denominationId, congregationId: null, label: 'Toda la denominación' }],
      },
      ...CONGREGATION_ROLES.map((role) => ({ role, scopes: congregationScopes })),
    ];
    return { isPlatformAdmin: false, audienceLabel: this.denominationName(actor.denominationId), roles };
  }

  private toManagedUser(user: User, actor: Actor): ManagedUser {
    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      status: statusOf(user),
      lastLoginAt: user.lastLoginAt,
      isSelf: user.id === actor.userId,
      assignments: this.visibleRolesOf(user.id, actor)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
        .map((row) => this.toView(row, actor)),
    };
  }

  private toView(row: UserRoleAssignment, actor: Actor): RoleAssignmentView {
    return {
      id: row.id,
      role: row.role,
      scope: row.scope,
      denominationId: row.denominationId,
      congregationId: row.congregationId,
      scopeLabel: this.scopeLabel(row, actor),
      grantedByName: this.db.users.find((user) => user.id === row.grantedById)?.displayName ?? null,
      createdAt: row.createdAt,
      revokedAt: row.revokedAt,
    };
  }

  private scopeLabel(row: UserRoleAssignment, actor: Actor): string {
    switch (row.scope) {
      case 'PLATFORM':
        return 'Plataforma';
      case 'DENOMINATION':
        return actor.isPlatformAdmin
          ? `Toda la denominación · ${this.denominationName(row.denominationId)}`
          : 'Toda la denominación';
      case 'CONGREGATION':
        return this.db.congregation(row.congregationId ?? 0)?.name ?? 'Sede';
    }
  }

  private denominationName(id: number | null): string {
    return this.db.denominations.find((item) => item.id === id)?.name ?? 'Denominación';
  }
}

function statusOf(user: User): UserStatus {
  if (!user.isActive) {
    return 'INACTIVE';
  }
  return user.invitationPending ? 'INVITATION_PENDING' : 'ACTIVE';
}
