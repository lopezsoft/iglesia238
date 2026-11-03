import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditActor,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import { formatScopeKey } from '../../../common/tenancy/scope-key.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  ADMIN_ROLE_CODES,
  managerOf,
  resolveGrantScope,
  visibilityOf,
  type UserManager,
} from './role-policy.js';
import {
  GRANT_SCOPE_READER,
  ROLE_CATALOG,
  USER_DIRECTORY,
  type AssignmentRecord,
  type GrantScopeReader,
  type RoleCatalog,
  type UserDirectory,
} from './users.ports.js';
import { type AssignmentView, toAssignmentView } from './users.views.js';

export const AUDIT_ENTITY_USER_ROLE = 'UserRole';

export function auditActorOf(manager: UserManager): AuditActor {
  return {
    userId: manager.userId,
    denominationId: manager.denominationId,
    congregationId: null,
  };
}

export function scopeKeyOf(assignment: AssignmentRecord): string {
  switch (assignment.scope) {
    case 'PLATFORM':
      return formatScopeKey('PLATFORM');
    case 'DENOMINATION':
      return formatScopeKey('DENOMINATION', assignment.denominationId);
    case 'CONGREGATION':
      return formatScopeKey('CONGREGATION', assignment.congregationId);
  }
}

/** A role is never granted to the person granting it. */
export function assertNotSelfGrant(
  manager: UserManager,
  targetUserId: number,
): void {
  if (targetUserId === manager.userId) {
    throw new ConflictDomainException(
      'No puedes asignarte roles a ti mismo: pídeselo a otro administrador o al equipo de plataforma.',
      'SELF_GRANT',
    );
  }
}

export interface GrantRoleCommand {
  readonly context: TenantContext;
  readonly userId: number;
  readonly role: string;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly ipAddress: string | null;
}

@Injectable()
export class GrantRoleUseCase {
  constructor(
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(ROLE_CATALOG) private readonly roles: RoleCatalog,
    @Inject(GRANT_SCOPE_READER) private readonly scopes: GrantScopeReader,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(command: GrantRoleCommand): Promise<AssignmentView> {
    const manager = managerOf(command.context);
    const visibility = visibilityOf(manager);

    // Separation of duties: nobody widens their own access (an administrator could otherwise take the
    // finance permissions the role deliberately lacks). Another administrator or the platform grants it.
    assertNotSelfGrant(manager, command.userId);
    if (!(await this.roles.exists(command.role))) {
      throw new InvalidInputException('El rol no es válido.', 'INVALID_ROLE');
    }
    const user = await this.users.findVisible(visibility, command.userId);
    if (!user) {
      throw new NotFoundDomainException(
        'El usuario no existe o no pertenece a tu denominación.',
      );
    }
    const scope = await resolveGrantScope(manager, command, this.scopes);
    if (
      await this.users.hasActiveAssignment(
        user.id,
        command.role,
        scope.scopeKey,
      )
    ) {
      throw new ConflictDomainException(
        'El usuario ya tiene ese rol activo en ese alcance.',
        'DUPLICATE_ROLE',
      );
    }

    const assignmentId = await this.transactions.run(async (transaction) => {
      const id = await this.users.insertAssignment(
        {
          userId: user.id,
          roleCode: command.role,
          scope: scope.scope,
          denominationId: scope.denominationId,
          congregationId: scope.congregationId,
          scopeKey: scope.scopeKey,
          grantedById: manager.userId,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'ROLE_GRANTED',
          entity: AUDIT_ENTITY_USER_ROLE,
          entityId: id,
          actor: auditActorOf(manager),
          denominationId: scope.denominationId,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            null,
            { role: command.role, scopeKey: scope.scopeKey },
            ['role', 'scopeKey'],
          ),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
      return id;
    });

    const created = await this.users.findAssignment(visibility, assignmentId);
    if (!created) {
      throw new NotFoundDomainException('La asignación no existe.');
    }
    return toAssignmentView(created, manager);
  }
}

export interface RevokeRoleCommand {
  readonly context: TenantContext;
  readonly assignmentId: number;
  readonly ipAddress: string | null;
}

@Injectable()
export class RevokeRoleUseCase {
  constructor(
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  /**
   * The row is kept (revokedAt). Permissions are computed on every request, so the change applies at
   * once: the user's next call already fails.
   */
  async execute(command: RevokeRoleCommand): Promise<AssignmentView> {
    const manager = managerOf(command.context);
    const visibility = visibilityOf(manager);

    const assignment = await this.users.findAssignment(
      visibility,
      command.assignmentId,
    );
    if (!assignment) {
      throw new NotFoundDomainException(
        'La asignación no existe o no pertenece a tu denominación.',
      );
    }
    if (assignment.revokedAt !== null) {
      throw new ConflictDomainException(
        'Esta asignación ya estaba revocada.',
        'ALREADY_REVOKED',
      );
    }
    if (
      assignment.userId === manager.userId &&
      ADMIN_ROLE_CODES.includes(assignment.roleCode)
    ) {
      throw new ConflictDomainException(
        'No puedes revocar tu propio rol de administrador: perderías el acceso a esta pantalla.',
        'SELF_REVOKE',
      );
    }

    await this.transactions.run(async (transaction) => {
      await this.users.revokeAssignment(
        assignment.id,
        this.clock.now(),
        transaction,
      );
      await this.audit.record(
        {
          action: 'ROLE_REVOKED',
          entity: AUDIT_ENTITY_USER_ROLE,
          entityId: assignment.id,
          actor: auditActorOf(manager),
          denominationId: assignment.denominationId,
          congregationId: assignment.congregationId,
          changes: buildAuditChanges(
            { role: assignment.roleCode, scopeKey: scopeKeyOf(assignment) },
            { role: null, scopeKey: null },
            ['role', 'scopeKey'],
          ),
          ipAddress: command.ipAddress,
        },
        transaction,
      );
    });

    const revoked = await this.users.findAssignment(visibility, assignment.id);
    if (!revoked) {
      throw new NotFoundDomainException('La asignación no existe.');
    }
    return toAssignmentView(revoked, manager);
  }
}
