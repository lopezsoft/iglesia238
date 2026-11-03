import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import {
  certificateAlreadyVoided,
  certificateNotFound,
  requireVoidReason,
} from '../certificate-errors.js';
import { toCertificateListItem } from '../certificate-mappers.js';
import type { CertificateListItemView } from '../certificate.models.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

/**
 * Voids a certificate. The record and its number stay (the series has no gaps and the number is
 * never reused); only the status and the reason change.
 */
@Injectable()
export class VoidCertificateUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: { id: number; reason: string },
    ipAddress: string | null = null,
  ): Promise<CertificateListItemView> {
    const scope = tenant.congregationScope();
    const existing = await this.certificates.findById(scope, input.id);
    if (!existing) {
      throw certificateNotFound();
    }
    if (existing.voidedAt !== null) {
      throw certificateAlreadyVoided();
    }
    const reason = requireVoidReason(input.reason);
    const at = this.clock.now();

    await this.transactions.run(async (transaction) => {
      const done = await this.certificates.markVoided(
        scope,
        existing.id,
        reason,
        at,
        transaction,
      );
      // Someone else voided it between the read and the update.
      if (!done) {
        throw certificateAlreadyVoided();
      }
      await this.audit.record(
        {
          action: 'CERTIFICATE_VOIDED',
          entity: 'Certificate',
          entityId: existing.id,
          actor: tenant,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            { status: 'ISSUED' },
            { status: 'VOIDED' },
            ['status'],
          ),
          ipAddress,
        },
        transaction,
      );
    });
    return toCertificateListItem({
      ...existing,
      voidedAt: at,
      voidReason: reason,
    });
  }
}
