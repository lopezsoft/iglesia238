import { Inject, Injectable } from '@nestjs/common';
import { formatCertificateCode } from '../../../../common/numbering/document-numbering.service.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import type { CertificatePreviewView } from '../certificate.models.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';
import {
  CertificateDraftService,
  type DraftInput,
} from './certificate-draft.service.js';

/**
 * What the certificate would print right now, with the number it would get. The number is not
 * reserved: another certificate may take it before this one is issued.
 */
@Injectable()
export class PreviewCertificateUseCase {
  constructor(
    private readonly drafts: CertificateDraftService,
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: DraftInput,
  ): Promise<CertificatePreviewView> {
    const scope = tenant.congregationScope();
    const today = this.clock.today();
    const draft = await this.drafts.prepare(tenant, scope, input, today);

    const last = await this.certificates.lastSequenceValues(scope, [
      draft.type.code,
    ]);
    const number = formatCertificateCode(
      draft.type.code,
      today,
      (last.get(draft.type.code) ?? 0) + 1,
    );

    const warnings: string[] = [];
    if (!draft.signers.pastor) {
      warnings.push(
        'La sede no tiene un pastor vigente: no se podrá emitir hasta registrarlo en periodos pastorales.',
      );
    }
    return {
      snapshot: this.drafts.snapshotOf(draft, number, today),
      warnings,
    };
  }
}
