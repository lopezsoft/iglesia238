import { Inject, Injectable } from '@nestjs/common';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import { toCents } from '../../../common/accounting/accounting-rules.js';
import {
  validAmount,
  validNotes,
} from '../../../common/accounting/input-validation.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { VowErrorCode, validDueDate } from './create-vow-pledge.use-case.js';
import { formatPesos } from '../../contributions/domain/vow-payment-rules.js';
import { toVowPledgeRow } from './vow-pledge-mappers.js';
import type { VowPledgeRow } from './vow-pledge.models.js';
import {
  VOWS_REPOSITORY,
  type VowPledgeChanges,
  type VowsRepository,
} from './vows.repository.js';

export interface UpdateVowPledgeCommand {
  pledgedAmount?: number;
  /** Null clears the due date. */
  dueOn?: string | null;
  /** Null clears the observations. */
  description?: string | null;
  ipAddress?: string | null;
}

/**
 * Changes the amount, the due date or the observations of a pledge that is not cancelled. The
 * amount cannot fall below what has already been paid; the status follows (raising the amount of
 * a fulfilled pledge reopens it).
 */
@Injectable()
export class UpdateVowPledgeUseCase {
  constructor(
    @Inject(VOWS_REPOSITORY) private readonly repository: VowsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    command: UpdateVowPledgeCommand,
  ): Promise<VowPledgeRow> {
    const scope = requireCongregationScope(
      tenant,
      'modificar promesas de voto',
    );
    if (
      command.pledgedAmount === undefined &&
      command.dueOn === undefined &&
      command.description === undefined
    ) {
      throw new InvalidInputException(
        'Indica qué quieres modificar de la promesa.',
      );
    }

    const existing = await this.repository.findById(scope, id);
    if (!existing) {
      throw new NotFoundDomainException(
        'La promesa de voto no existe en la sede.',
      );
    }

    await this.transactions.run(async (transaction) => {
      const pledge = await this.repository.lock(scope, id, transaction);
      if (!pledge) {
        throw new NotFoundDomainException(
          'La promesa de voto no existe en la sede.',
        );
      }
      if (pledge.status === 'CANCELLED') {
        throw new ConflictDomainException(
          'La promesa está cancelada: no se puede modificar.',
          VowErrorCode.VOW_PLEDGE_CANCELLED,
        );
      }

      const changes: VowPledgeChanges = {};
      if (command.pledgedAmount !== undefined) {
        const amount = validAmount(command.pledgedAmount, 'prometido');
        if (toCents(amount) < toCents(pledge.paid)) {
          throw new BusinessRuleException(
            `El valor prometido no puede ser menor a lo ya abonado (${formatPesos(pledge.paid)}).`,
            VowErrorCode.VOW_AMOUNT_BELOW_PAID,
          );
        }
        changes.pledgedAmount = amount;
      }
      if (command.dueOn !== undefined) {
        changes.dueOn = validDueDate(command.dueOn, pledge.pledgedOn);
      }
      if (command.description !== undefined) {
        changes.description = validNotes(
          command.description,
          'Las observaciones',
        );
      }

      await this.repository.update(scope, id, changes, transaction);
      const status = await this.repository.refreshStatus(
        scope,
        id,
        transaction,
      );

      await this.audit.record(
        {
          action: 'VOW_PLEDGE_UPDATED',
          entity: 'VowPledge',
          entityId: id,
          actor: tenant,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            {
              pledgedAmount: pledge.pledgedAmount,
              dueOn: pledge.dueOn,
              status: pledge.status,
            },
            {
              pledgedAmount: changes.pledgedAmount ?? pledge.pledgedAmount,
              dueOn: changes.dueOn === undefined ? pledge.dueOn : changes.dueOn,
              status,
            },
            ['pledgedAmount', 'dueOn', 'status'],
          ),
          ipAddress: command.ipAddress ?? null,
        },
        transaction,
      );
    });

    const record = await this.repository.findById(scope, id);
    if (!record) {
      throw new NotFoundDomainException(
        'La promesa de voto no existe en la sede.',
      );
    }
    return toVowPledgeRow(record, this.clock.today());
  }
}
