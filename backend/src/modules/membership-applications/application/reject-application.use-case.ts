import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { BusinessRuleException } from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  isReviewable,
  REJECTION_REASON_MAX_LENGTH,
  REJECTION_REASON_MIN_LENGTH,
} from '../domain/application-status.js';
import {
  applicationNotFound,
  invalidTransition,
} from './application-errors.js';
import type { ApplicationDetailView } from './application-views.js';
import { ApplicationAssembler } from './application.assembler.js';
import {
  APPLICATIONS_REPOSITORY,
  type ApplicationsRepository,
} from './ports/applications.repository.js';

/**
 * PENDING or IN_REVIEW -> REJECTED. The reason is internal: the applicant only learns that the
 * application was not approved, and the audit entry does not copy the text (it may name people).
 */
@Injectable()
export class RejectApplicationUseCase {
  constructor(
    @Inject(APPLICATIONS_REPOSITORY)
    private readonly applications: ApplicationsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly assembler: ApplicationAssembler,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    reason: string,
    ip: string | null,
  ): Promise<ApplicationDetailView> {
    const scope = tenant.tenantScope();
    const rejectionReason = reason.trim();
    if (rejectionReason === '') {
      throw new BusinessRuleException(
        'Escribe el motivo del rechazo.',
        'REJECTION_REASON_REQUIRED',
      );
    }
    if (rejectionReason.length < REJECTION_REASON_MIN_LENGTH) {
      throw new BusinessRuleException(
        `El motivo del rechazo debe tener al menos ${REJECTION_REASON_MIN_LENGTH} caracteres.`,
        'REJECTION_REASON_TOO_SHORT',
      );
    }
    if (rejectionReason.length > REJECTION_REASON_MAX_LENGTH) {
      throw new BusinessRuleException(
        `El motivo del rechazo admite máximo ${REJECTION_REASON_MAX_LENGTH} caracteres.`,
        'REJECTION_REASON_TOO_LONG',
      );
    }

    await this.transactions.run(async (transaction) => {
      const record = await this.applications.findById(scope, id, transaction);
      if (!record) {
        throw applicationNotFound();
      }
      if (!isReviewable(record.status)) {
        throw invalidTransition();
      }
      const rejected = await this.applications.transition(
        scope,
        id,
        ['PENDING', 'IN_REVIEW'],
        {
          status: 'REJECTED',
          reviewerId: tenant.userId,
          reviewedAt: this.clock.now(),
          rejectionReason,
        },
        transaction,
      );
      if (!rejected) {
        throw invalidTransition();
      }
      await this.audit.record(
        {
          action: 'APPLICATION_REJECTED',
          entity: 'MembershipApplication',
          entityId: id,
          actor: tenant,
          congregationId: record.congregationId,
          changes: buildAuditChanges(
            { status: record.status },
            { status: 'REJECTED' },
            ['status'],
          ),
          ipAddress: ip,
        },
        transaction,
      );
    });

    const updated = await this.applications.findById(scope, id);
    if (!updated) {
      throw applicationNotFound();
    }
    return this.assembler.detail(scope, updated);
  }
}
