import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { certificateNotFound } from '../certificate-errors.js';
import { readScope, toCertificateDetail } from '../certificate-mappers.js';
import type { CertificateDetailView } from '../certificate.models.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

@Injectable()
export class GetCertificateUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
  ): Promise<CertificateDetailView> {
    const record = await this.certificates.findById(readScope(tenant), id);
    if (!record) {
      throw certificateNotFound();
    }
    return toCertificateDetail(record);
  }
}
