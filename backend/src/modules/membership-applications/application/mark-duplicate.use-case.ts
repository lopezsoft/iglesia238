import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { isReviewable } from '../domain/application-status.js';
import {
  applicationNotFound,
  invalidMatch,
  invalidTransition,
} from './application-errors.js';
import type { ApplicationDetailView } from './application-views.js';
import {
  ApplicationAssembler,
  documentRefOf,
  sameDocument,
} from './application.assembler.js';
import {
  APPLICATIONS_REPOSITORY,
  type ApplicationsRepository,
} from './ports/applications.repository.js';
import {
  MEMBERSHIP_REGISTRY,
  type MembershipRegistry,
} from './ports/membership-registry.port.js';

/**
 * PENDING or IN_REVIEW -> DUPLICATE, linked to the existing person that holds the same document.
 * No member is created: the application is closed without consequences for the registry.
 */
@Injectable()
export class MarkDuplicateUseCase {
  constructor(
    @Inject(APPLICATIONS_REPOSITORY)
    private readonly applications: ApplicationsRepository,
    @Inject(MEMBERSHIP_REGISTRY) private readonly registry: MembershipRegistry,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly assembler: ApplicationAssembler,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
    matchedPersonId: number,
    ip: string | null,
  ): Promise<ApplicationDetailView> {
    const scope = tenant.tenantScope();

    await this.transactions.run(async (transaction) => {
      const record = await this.applications.findById(scope, id, transaction);
      if (!record) {
        throw applicationNotFound();
      }
      if (!isReviewable(record.status)) {
        throw invalidTransition();
      }
      const ref = documentRefOf(record);
      const match = ref
        ? (
            await this.registry.findPeopleByDocuments(scope, [ref], transaction)
          ).find((person) => sameDocument(person, ref))
        : undefined;
      if (!match || match.id !== matchedPersonId) {
        throw invalidMatch();
      }

      const marked = await this.applications.transition(
        scope,
        id,
        ['PENDING', 'IN_REVIEW'],
        {
          status: 'DUPLICATE',
          reviewerId: tenant.userId,
          reviewedAt: this.clock.now(),
          matchedPersonId,
        },
        transaction,
      );
      if (!marked) {
        throw invalidTransition();
      }
      await this.audit.record(
        {
          action: 'APPLICATION_MARKED_DUPLICATE',
          entity: 'MembershipApplication',
          entityId: id,
          actor: tenant,
          congregationId: record.congregationId,
          changes: buildAuditChanges(
            { status: record.status, matchedPersonId: null },
            { status: 'DUPLICATE', matchedPersonId },
            ['status', 'matchedPersonId'],
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
