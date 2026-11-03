import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import { TRANSACTION_RUNNER } from '../../../../common/persistence/transaction.js';
import type { TransactionRunner } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { requireMember } from '../command-context.js';
import type { CommandContext } from '../command-context.js';
import { assertPastOrToday } from '../member-rules.js';
import type { CatalogItem, MemberPositionsView } from '../member.models.js';
import { POSITION_REPOSITORY } from '../ports/member-details.repositories.js';
import type { PositionRepository } from '../ports/member-details.repositories.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';

@Injectable()
export class GetMemberPositionsUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepository,
  ) {}

  async execute(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberPositionsView> {
    const member = await requireMember(this.members, scope, memberId);
    const [rows, positionCatalog, rankCatalog] = await Promise.all([
      this.positions.positionsOf(scope, member.id),
      this.positions.positionCatalog(scope),
      this.positions.rankCatalog(scope),
    ]);
    return {
      pastoralRankId: member.pastoralRankId,
      pastoralRankName:
        rankCatalog.find((rank) => rank.id === member.pastoralRankId)?.name ??
        null,
      positions: [...rows].sort((a, b) =>
        (b.startedOn ?? '').localeCompare(a.startedOn ?? ''),
      ),
      positionCatalog,
      rankCatalog,
    };
  }
}

/** Catalogs for filters and selects: positions and pastoral ranks of the denomination. */
@Injectable()
export class ListPositionCatalogsUseCase {
  constructor(
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepository,
  ) {}

  positionCatalog(scope: TenantScope): Promise<CatalogItem[]> {
    return this.positions.positionCatalog(scope);
  }

  rankCatalog(scope: TenantScope): Promise<CatalogItem[]> {
    return this.positions.rankCatalog(scope);
  }
}

@Injectable()
export class AssignPositionUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    command: { positionId: number; startedOn: string },
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    if (member.status !== 'ACTIVE') {
      throw new BusinessRuleException(
        'Solo los miembros activos pueden ocupar cargos.',
        'MEMBER_NOT_ACTIVE',
      );
    }
    const catalog = await this.positions.positionCatalog(scope);
    const position = catalog.find(
      (item) => item.id === command.positionId && item.isActive,
    );
    if (!position) {
      throw new NotFoundDomainException('El cargo no existe o está inactivo.');
    }
    assertPastOrToday(
      command.startedOn,
      this.clock.today(),
      'La fecha de inicio no es válida o es futura.',
    );
    const open = await this.positions.openPositionsOf(scope, member.id);
    if (open.some((row) => row.positionId === position.id)) {
      throw new ConflictDomainException(
        'El miembro ya ocupa ese cargo.',
        'DUPLICATE_POSITION',
      );
    }

    await this.transactions.run(async (transaction) => {
      const id = await this.positions.add(
        scope,
        member.id,
        position.id,
        command.startedOn,
        transaction,
      );
      await this.audit.record(
        {
          action: 'CREATED',
          entity: 'MemberPosition',
          entityId: id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: { positionId: { from: null, to: position.id } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}

@Injectable()
export class ClosePositionUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    memberPositionId: number,
    endedOn: string,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const row = await this.positions.findRow(
      scope,
      member.id,
      memberPositionId,
    );
    if (!row) {
      throw new NotFoundDomainException('El cargo ya no existe.');
    }
    if (row.endedOn !== null) {
      throw new ConflictDomainException(
        'El cargo ya estaba cerrado.',
        'POSITION_ALREADY_CLOSED',
      );
    }
    assertPastOrToday(
      endedOn,
      this.clock.today(),
      'La fecha de cierre no es válida o es futura.',
    );
    if (row.startedOn && endedOn < row.startedOn) {
      throw new InvalidInputException(
        'La fecha de cierre no puede ser anterior al inicio del cargo.',
        'INVALID_DATE',
      );
    }

    await this.transactions.run(async (transaction) => {
      await this.positions.close(scope, row.id, endedOn, transaction);
      await this.audit.record(
        {
          action: 'UPDATED',
          entity: 'MemberPosition',
          entityId: row.id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: { endedOn: { from: null, to: endedOn } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}

@Injectable()
export class SetPastoralRankUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    pastoralRankId: number | null,
  ): Promise<void> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    if (pastoralRankId !== null) {
      const ranks = await this.positions.rankCatalog(scope);
      if (!ranks.some((rank) => rank.id === pastoralRankId && rank.isActive)) {
        throw new NotFoundDomainException(
          'El grado pastoral no existe o está inactivo.',
        );
      }
    }
    await this.transactions.run(async (transaction) => {
      await this.members.updatePastoralRank(
        scope,
        member.id,
        pastoralRankId,
        transaction,
      );
      await this.audit.record(
        {
          action: 'UPDATED',
          entity: 'Member',
          entityId: member.id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: {
            pastoralRankId: { from: member.pastoralRankId, to: pastoralRankId },
          },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
  }
}
