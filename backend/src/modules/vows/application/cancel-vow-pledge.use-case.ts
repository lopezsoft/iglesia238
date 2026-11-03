import { Inject, Injectable } from '@nestjs/common';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import { validReason } from '../../../common/accounting/input-validation.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { vowPledgeStatusFor } from '../domain/vow-pledge-rules.js';
import { VowErrorCode } from './create-vow-pledge.use-case.js';
import { toVowPledgeRow } from './vow-pledge-mappers.js';
import type { VowPledgeRow } from './vow-pledge.models.js';
import { VOWS_REPOSITORY, type VowsRepository } from './vows.repository.js';

/**
 * Cancels a pledge that is still active, with a reason. The payments already made stay as they
 * are (they are contributions with their receipts); the pledge just stops accepting payments.
 */
@Injectable()
export class CancelVowPledgeUseCase {
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
    reason: string,
    ipAddress: string | null = null,
  ): Promise<VowPledgeRow> {
    const scope = requireCongregationScope(tenant, 'cancelar promesas de voto');
    const cleanReason = validReason(reason, 'la cancelación');

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
          'La promesa ya está cancelada.',
          VowErrorCode.VOW_PLEDGE_CANCELLED,
        );
      }
      if (
        vowPledgeStatusFor(pledge.status, pledge.pledgedAmount, pledge.paid) ===
        'FULFILLED'
      ) {
        throw new ConflictDomainException(
          'La promesa ya está cumplida: no se puede cancelar.',
          VowErrorCode.VOW_PLEDGE_FULFILLED,
        );
      }
      if (!(await this.repository.cancel(scope, id, transaction))) {
        throw new ConflictDomainException(
          'La promesa cambió mientras se procesaba: recarga e inténtalo de nuevo.',
          VowErrorCode.VOW_PLEDGE_CHANGED,
        );
      }
      await this.audit.record(
        {
          action: 'VOW_PLEDGE_CANCELLED',
          entity: 'VowPledge',
          entityId: id,
          actor: tenant,
          congregationId: scope.congregationId,
          changes: {
            status: { from: 'ACTIVE', to: 'CANCELLED' },
            reason: { from: null, to: cleanReason },
          },
          ipAddress,
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
