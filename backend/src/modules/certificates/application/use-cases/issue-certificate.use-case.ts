import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { buildAuditChanges } from '../../../../common/audit/audit-changes.js';
import {
  DocumentNumberingService,
  formatCertificateCode,
} from '../../../../common/numbering/document-numbering.service.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { addDays } from '../certificate-document.js';
import { pastorRequired } from '../certificate-errors.js';
import { toCertificateListItem } from '../certificate-mappers.js';
import type { CertificateListItemView } from '../certificate.models.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';
import {
  CertificateDraftService,
  type DraftInput,
} from './certificate-draft.service.js';

/**
 * Issues a certificate. All the checks run first; the number is taken inside the transaction that
 * stores the certificate, so a rejected request never leaves a gap in the series.
 */
@Injectable()
export class IssueCertificateUseCase {
  constructor(
    private readonly drafts: CertificateDraftService,
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    private readonly numbering: DocumentNumberingService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: DraftInput,
    ipAddress: string | null = null,
  ): Promise<CertificateListItemView> {
    const scope = tenant.congregationScope();
    const issuedOn = this.clock.today();
    const draft = await this.drafts.prepare(tenant, scope, input, issuedOn);

    const pastor = draft.signers.pastor;
    if (!pastor) {
      throw pastorRequired();
    }
    const validityDays = draft.type.validityDays;

    const saved = await this.transactions.run(async (transaction) => {
      const sequenceNumber = await this.numbering.nextCertificateNumber(
        scope,
        draft.type.code,
        transaction,
      );
      const number = formatCertificateCode(
        draft.type.code,
        issuedOn,
        sequenceNumber,
      );
      const record = await this.certificates.insert(
        scope,
        {
          certificateTypeId: draft.type.id,
          memberId: draft.member.id,
          sequenceNumber,
          issuedOn,
          expiresOn: validityDays ? addDays(issuedOn, validityDays) : null,
          notes: draft.notes,
          pastorSignerId: pastor.personId,
          secretarySignerId: draft.signers.secretary?.personId ?? null,
          issuedById: tenant.userId,
          snapshot: this.drafts.snapshotOf(draft, number, issuedOn),
        },
        transaction,
      );
      await this.audit.record(
        {
          action: 'CERTIFICATE_ISSUED',
          entity: 'Certificate',
          entityId: record.id,
          actor: tenant,
          congregationId: scope.congregationId,
          changes: buildAuditChanges(
            null,
            { number, typeCode: draft.type.code },
            ['number', 'typeCode'],
          ),
          ipAddress,
        },
        transaction,
      );
      return record;
    });
    return toCertificateListItem(saved);
  }
}
