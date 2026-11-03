import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../../common/errors/domain.exception.js';
import { formatCertificateCode } from '../../../../common/numbering/document-numbering.service.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import type { IssuingContextView } from '../certificate.models.js';
import {
  CERTIFICATE_CONTEXT_READER,
  type CertificateContextReader,
} from '../ports/certificate-context.reader.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

/** Sede, signers and series of the active sede: everything the issue form and preview need. */
@Injectable()
export class GetIssuingContextUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    @Inject(CERTIFICATE_CONTEXT_READER)
    private readonly context: CertificateContextReader,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext): Promise<IssuingContextView> {
    const scope = tenant.congregationScope();
    const today = this.clock.today();

    const letterhead = await this.context.findLetterhead(scope);
    if (!letterhead) {
      throw new NotFoundDomainException('La sede no existe.');
    }
    const [signers, issuedByName, types] = await Promise.all([
      this.context.findSigners(scope, tenant.userId, today),
      this.context.findUserName(tenant.userId),
      this.certificates.listTypes(scope),
    ]);
    const last = await this.certificates.lastSequenceValues(
      scope,
      types.map((type) => type.code),
    );

    return {
      congregationId: scope.requireCongregationId(),
      year: Number(today.slice(0, 4)),
      today,
      letterhead,
      signers: {
        pastorName: signers.pastor?.name ?? null,
        secretaryName: signers.secretary?.name ?? null,
      },
      issuedByName: issuedByName ?? '—',
      types: types.map((type) => ({
        id: type.id,
        code: type.code,
        name: type.name,
        nextNumber: formatCertificateCode(
          type.code,
          today,
          (last.get(type.code) ?? 0) + 1,
        ),
      })),
    };
  }
}
