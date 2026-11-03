import { Inject, Injectable } from '@nestjs/common';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { validReason } from '../../../common/accounting/input-validation.js';
import { receiptCode, toContributionRow } from './contribution-mappers.js';
import type { ContributionRow } from './contribution.models.js';
import {
  CONTRIBUTIONS_REPOSITORY,
  type ContributionsRepository,
} from './contributions.repository.js';

export const VoidErrorCode = {
  ALREADY_VOIDED: 'ALREADY_VOIDED',
  CONTRIBUTION_SETTLED: 'CONTRIBUTION_SETTLED',
  CONTRIBUTION_CONSOLIDATED: 'CONTRIBUTION_CONSOLIDATED',
  CONTRIBUTION_CHANGED: 'CONTRIBUTION_CHANGED',
} as const;

/**
 * Voids a contribution with a reason. The row is kept: the receipt is voided too, and a vow
 * payment gives its amount back to the pledge (a fulfilled pledge reopens). A contribution that
 * is part of a tithe settlement or of a cash consolidation cannot be voided: those are undone first.
 */
@Injectable()
export class VoidContributionUseCase {
  constructor(
    @Inject(CONTRIBUTIONS_REPOSITORY)
    private readonly repository: ContributionsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    reason: string,
    ipAddress: string | null = null,
  ): Promise<ContributionRow> {
    const scope = requireCongregationScope(tenant, 'anular aportes');
    const cleanReason = validReason(reason, 'la anulación');

    const record = await this.repository.findById(scope, id);
    if (!record) {
      throw new NotFoundDomainException('El aporte no existe en la sede.');
    }
    if (record.status === 'VOIDED') {
      throw new ConflictDomainException(
        'El aporte ya está anulado.',
        VoidErrorCode.ALREADY_VOIDED,
      );
    }
    if (record.settled) {
      throw new ConflictDomainException(
        'Un aporte liquidado no se puede anular: ya forma parte de una liquidación del diezmo.',
        VoidErrorCode.CONTRIBUTION_SETTLED,
      );
    }
    if (record.consolidated) {
      // Corrections go through the cash book: reversing the consolidation releases its contributions.
      throw new ConflictDomainException(
        'El aporte ya está consolidado en el libro de caja: reversa primero la consolidación desde el Libro de caja y luego anúlalo.',
        VoidErrorCode.CONTRIBUTION_CONSOLIDATED,
      );
    }

    const receipt = receiptCode(record.receiptNumber, record.receivedOn);
    await this.transactions.run(async (transaction) => {
      if (record.vowPledgeId !== null) {
        // Serializes with payments to the same pledge, so the balance is recomputed on a stable base.
        await this.repository.lockVowPledge(
          scope,
          record.vowPledgeId,
          transaction,
        );
      }
      const voided = await this.repository.markVoided(
        scope,
        record.id,
        tenant.userId,
        cleanReason,
        transaction,
      );
      if (!voided) {
        throw new ConflictDomainException(
          'El aporte cambió mientras se procesaba: recarga la lista e inténtalo de nuevo.',
          VoidErrorCode.CONTRIBUTION_CHANGED,
        );
      }
      if (record.voucherId !== null) {
        await this.repository.voidVoucher(
          scope,
          record.voucherId,
          cleanReason,
          transaction,
        );
      }
      if (record.vowPledgeId !== null) {
        await this.repository.refreshVowPledgeStatus(
          scope,
          record.vowPledgeId,
          transaction,
        );
      }
      await this.audit.record(
        {
          action: 'CONTRIBUTION_VOIDED',
          entity: 'Contribution',
          entityId: record.id,
          actor: tenant,
          congregationId: scope.congregationId,
          changes: {
            ...buildAuditChanges({ status: 'RECORDED' }, { status: 'VOIDED' }, [
              'status',
            ]),
            amount: { from: record.amount, to: record.amount },
            receipt: { from: receipt, to: receipt },
          },
          ipAddress,
        },
        transaction,
      );
    });

    const updated = await this.repository.findById(scope, record.id);
    if (!updated) {
      throw new NotFoundDomainException('El aporte no existe en la sede.');
    }
    return toContributionRow(updated);
  }
}
