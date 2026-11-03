import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
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

/** PENDING -> IN_REVIEW, assigned to the reviewer who takes it. */
@Injectable()
export class StartReviewUseCase {
  constructor(
    @Inject(APPLICATIONS_REPOSITORY)
    private readonly applications: ApplicationsRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly assembler: ApplicationAssembler,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    ip: string | null,
  ): Promise<ApplicationDetailView> {
    const scope = tenant.tenantScope();

    await this.transactions.run(async (transaction) => {
      const record = await this.applications.findById(scope, id, transaction);
      if (!record) {
        throw applicationNotFound();
      }
      const taken = await this.applications.transition(
        scope,
        id,
        ['PENDING'],
        { status: 'IN_REVIEW', reviewerId: tenant.userId, reviewedAt: null },
        transaction,
      );
      if (!taken) {
        throw invalidTransition(
          'Solo una solicitud pendiente puede tomarse en revisión.',
        );
      }
      await this.audit.record(
        {
          action: 'APPLICATION_REVIEW_STARTED',
          entity: 'MembershipApplication',
          entityId: id,
          actor: tenant,
          congregationId: record.congregationId,
          changes: buildAuditChanges(
            { status: record.status },
            { status: 'IN_REVIEW' },
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
