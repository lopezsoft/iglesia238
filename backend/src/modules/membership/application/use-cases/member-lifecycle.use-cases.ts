import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  BusinessRuleException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import { DocumentNumberingService } from '../../../../common/numbering/document-numbering.service.js';
import { TRANSACTION_RUNNER } from '../../../../common/persistence/transaction.js';
import type { TransactionRunner } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { MEMBER_NOT_FOUND_MESSAGE, requireMember } from '../command-context.js';
import type { CommandContext } from '../command-context.js';
import {
  MANUAL_STATUS_CHANGES,
  assertPastOrToday,
  emptyToNull,
} from '../member-rules.js';
import type {
  MemberDetail,
  MemberRegistryView,
  MemberStatus,
  TransferCommand,
  TransferResult,
} from '../member.models.js';
import {
  POSITION_REPOSITORY,
  REGISTRY_REPOSITORY,
} from '../ports/member-details.repositories.js';
import type {
  PositionRepository,
  RegistryRepository,
} from '../ports/member-details.repositories.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';
import { closeOpenPositions } from './close-open-positions.js';

const MAX_REASON_LENGTH = 255;

export interface ChangeStatusCommand {
  readonly status: MemberStatus;
  readonly reason: string | null;
  /** Defaults to today. */
  readonly effectiveOn: string | null;
}

/** Marks a member inactive or deceased, or brings an inactive or transferred one back. */
@Injectable()
export class ChangeMemberStatusUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(REGISTRY_REPOSITORY) private readonly registry: RegistryRepository,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly numbering: DocumentNumberingService,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    command: ChangeStatusCommand,
  ): Promise<MemberDetail> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    const today = this.clock.today();
    const effectiveOn = emptyToNull(command.effectiveOn) ?? today;
    assertPastOrToday(
      effectiveOn,
      today,
      'La fecha del cambio no es válida o es futura.',
    );
    const reason = emptyToNull(command.reason);
    this.assertChangeAllowed(member.status, command.status, reason);

    await this.transactions.run(async (transaction) => {
      if (command.status === 'ACTIVE') {
        await this.reactivate(context, member, effectiveOn, transaction);
      } else {
        await closeOpenPositions(
          this.positions,
          this.audit,
          context,
          member,
          effectiveOn,
          transaction,
        );
        if (command.status === 'DECEASED') {
          await this.registry.closeCurrentEntry(
            scope,
            member.id,
            effectiveOn,
            transaction,
          );
        }
      }
      await this.members.updateStatus(
        scope,
        member.id,
        command.status,
        transaction,
      );
      await this.registry.addStatusHistory(
        scope,
        {
          memberId: member.id,
          status: command.status,
          startedOn: effectiveOn,
          reason,
          userId: context.actor.userId,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'MEMBER_STATUS_CHANGED',
          entity: 'Member',
          entityId: member.id,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: buildAuditChanges(
            { status: member.status },
            { status: command.status },
            ['status'],
          ),
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });

    const detail = await this.members.findDetail(scope, member.id);
    if (!detail) {
      throw new NotFoundDomainException(
        MEMBER_NOT_FOUND_MESSAGE,
        'MEMBER_NOT_FOUND',
      );
    }
    return detail;
  }

  private assertChangeAllowed(
    from: MemberStatus,
    to: MemberStatus,
    reason: string | null,
  ): void {
    if (from === to) {
      throw new BusinessRuleException(
        'El miembro ya tiene ese estado.',
        'STATUS_UNCHANGED',
      );
    }
    if (from === 'DECEASED') {
      throw new BusinessRuleException(
        'Un miembro fallecido no puede cambiar de estado.',
        'INVALID_STATUS_CHANGE',
      );
    }
    if (to === 'TRANSFERRED') {
      throw new BusinessRuleException(
        'El estado Trasladado se asigna al trasladar al miembro a otra iglesia.',
        'INVALID_STATUS_CHANGE',
      );
    }
    if (!MANUAL_STATUS_CHANGES[from].includes(to)) {
      throw new BusinessRuleException(
        'No se puede hacer ese cambio de estado.',
        'INVALID_STATUS_CHANGE',
      );
    }
    if (to !== 'ACTIVE' && (reason === null || reason.length < 3)) {
      throw new InvalidInputException(
        'Indica el motivo del cambio de estado.',
        'REASON_REQUIRED',
      );
    }
    if (reason !== null && reason.length > MAX_REASON_LENGTH) {
      throw new InvalidInputException(
        `El motivo admite máximo ${MAX_REASON_LENGTH} caracteres.`,
      );
    }
  }

  /** A transferred member has no open registry entry: a new one opens in the congregation. */
  private async reactivate(
    context: CommandContext,
    member: { id: number; congregationId: number },
    effectiveOn: string,
    transaction: Parameters<RegistryRepository['openEntry']>[2],
  ): Promise<void> {
    const memberScope = context.scope.forCongregation(member.congregationId);
    const current = await this.registry.currentEntry(
      memberScope,
      member.id,
      transaction,
    );
    if (current) {
      return;
    }
    const congregation = await this.registry.findCongregation(
      memberScope,
      member.congregationId,
      transaction,
    );
    if (!congregation?.isActive) {
      throw new BusinessRuleException(
        'La sede del miembro está inactiva: trasládalo a una sede activa antes de reactivarlo.',
        'CONGREGATION_INACTIVE',
      );
    }
    const memberNumber = await this.numbering.nextMemberNumber(
      memberScope,
      transaction,
    );
    await this.registry.openEntry(
      memberScope,
      {
        memberId: member.id,
        congregationId: member.congregationId,
        memberNumber,
        startedOn: effectiveOn,
        registryBook: null,
        registryFolio: null,
      },
      transaction,
    );
  }
}

/** Registry timeline, transfers and status history of a member. */
@Injectable()
export class GetMemberRegistryUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(REGISTRY_REPOSITORY) private readonly registry: RegistryRepository,
  ) {}

  async execute(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberRegistryView> {
    await requireMember(this.members, scope, memberId);
    return this.registry.view(scope, memberId);
  }
}

export interface DestinationOption {
  readonly id: number;
  readonly name: string;
  readonly municipalityCode: string | null;
}

@Injectable()
export class ListTransferDestinationsUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(REGISTRY_REPOSITORY) private readonly registry: RegistryRepository,
  ) {}

  async execute(
    scope: TenantScope,
    memberId: number,
  ): Promise<DestinationOption[]> {
    const member = await requireMember(this.members, scope, memberId);
    const congregations = await this.registry.listDestinations(
      scope,
      member.congregationId,
    );
    return congregations.map(({ id, name, municipalityCode }) => ({
      id,
      name,
      municipalityCode,
    }));
  }
}

/**
 * Moves a member to another congregation of the denomination (new registry entry with the next
 * number there) or to a church outside the system (status TRANSFERRED).
 */
@Injectable()
export class TransferMemberUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(REGISTRY_REPOSITORY) private readonly registry: RegistryRepository,
    @Inject(POSITION_REPOSITORY) private readonly positions: PositionRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly numbering: DocumentNumberingService,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    memberId: number,
    command: TransferCommand,
  ): Promise<TransferResult> {
    const { scope } = context;
    const member = await requireMember(this.members, scope, memberId);
    if (member.status !== 'ACTIVE') {
      throw new BusinessRuleException(
        'Solo se puede trasladar a un miembro activo.',
        'MEMBER_NOT_ACTIVE',
      );
    }
    const reason = command.reason.trim();
    if (reason === '' || reason.length > MAX_REASON_LENGTH) {
      throw new InvalidInputException(
        `Indica el motivo del traslado (máximo ${MAX_REASON_LENGTH} caracteres).`,
      );
    }
    assertPastOrToday(
      command.transferDate,
      this.clock.today(),
      'La fecha del traslado no es válida o es futura.',
    );
    const current = await this.registry.currentEntry(scope, member.id);
    if (current && command.transferDate < current.startedOn) {
      throw new InvalidInputException(
        'La fecha del traslado es anterior al registro vigente en la sede.',
        'INVALID_DATE',
      );
    }

    return command.kind === 'INTERNAL'
      ? this.transferInternally(context, member, command, reason)
      : this.transferExternally(context, member, command, reason);
  }

  private async transferInternally(
    context: CommandContext,
    member: { id: number; congregationId: number },
    command: Extract<TransferCommand, { kind: 'INTERNAL' }>,
    reason: string,
  ): Promise<TransferResult> {
    const { scope } = context;
    const destination = await this.registry.findCongregation(
      scope,
      command.destinationCongregationId,
    );
    if (!destination || !destination.isActive) {
      throw new BusinessRuleException(
        'La sede destino no existe o está inactiva.',
        'INVALID_DESTINATION',
      );
    }
    if (destination.id === member.congregationId) {
      throw new BusinessRuleException(
        'El miembro ya pertenece a esa sede.',
        'SAME_CONGREGATION',
      );
    }
    const destinationScope = scope.forCongregation(destination.id);

    await this.transactions.run(async (transaction) => {
      await this.registry.closeCurrentEntry(
        scope,
        member.id,
        command.transferDate,
        transaction,
      );
      const memberNumber = await this.numbering.nextMemberNumber(
        destinationScope,
        transaction,
      );
      await this.registry.openEntry(
        destinationScope,
        {
          memberId: member.id,
          congregationId: destination.id,
          memberNumber,
          startedOn: command.transferDate,
          registryBook: null,
          registryFolio: null,
        },
        transaction,
      );
      await this.members.updateCongregation(
        scope,
        member.id,
        destination.id,
        transaction,
      );
      const transferId = await this.registry.addTransfer(
        scope,
        {
          memberId: member.id,
          originCongregationId: member.congregationId,
          destinationCongregationId: destination.id,
          externalDestinationName: null,
          transferDate: command.transferDate,
          notes: reason,
          approvedById: context.actor.userId,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'MEMBER_TRANSFERRED',
          entity: 'MemberTransfer',
          entityId: transferId,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: {
            congregationId: { from: member.congregationId, to: destination.id },
            memberNumber: { from: null, to: memberNumber },
          },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
    return {
      kind: 'INTERNAL',
      destinationName: destination.name,
      stillVisible: scope.congregationId === null,
    };
  }

  private async transferExternally(
    context: CommandContext,
    member: { id: number; congregationId: number },
    command: Extract<TransferCommand, { kind: 'EXTERNAL' }>,
    reason: string,
  ): Promise<TransferResult> {
    const { scope } = context;
    const churchName = command.externalDestinationName.trim();
    if (churchName.length < 3 || churchName.length > 150) {
      throw new InvalidInputException(
        'Escribe el nombre de la iglesia destino (entre 3 y 150 caracteres).',
      );
    }

    await this.transactions.run(async (transaction) => {
      await this.registry.closeCurrentEntry(
        scope,
        member.id,
        command.transferDate,
        transaction,
      );
      await closeOpenPositions(
        this.positions,
        this.audit,
        context,
        member,
        command.transferDate,
        transaction,
      );
      await this.members.updateStatus(
        scope,
        member.id,
        'TRANSFERRED',
        transaction,
      );
      await this.registry.addStatusHistory(
        scope,
        {
          memberId: member.id,
          status: 'TRANSFERRED',
          startedOn: command.transferDate,
          reason: 'Traslado a otra iglesia',
          userId: context.actor.userId,
        },
        transaction,
      );
      const transferId = await this.registry.addTransfer(
        scope,
        {
          memberId: member.id,
          originCongregationId: member.congregationId,
          destinationCongregationId: null,
          externalDestinationName: churchName,
          transferDate: command.transferDate,
          notes: reason,
          approvedById: context.actor.userId,
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'MEMBER_TRANSFERRED',
          entity: 'MemberTransfer',
          entityId: transferId,
          actor: context.actor,
          congregationId: member.congregationId,
          changes: { status: { from: 'ACTIVE', to: 'TRANSFERRED' } },
          ipAddress: context.ipAddress,
        },
        transaction,
      );
    });
    return {
      kind: 'EXTERNAL',
      destinationName: churchName,
      stillVisible: true,
    };
  }
}
