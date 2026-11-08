import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import type { CertificateTypeView } from '../certificate.models.js';
import { canSeeType } from '../certificate-access.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

/** Catalog of certificate types of the denomination. Available in a denomination scope too. */
@Injectable()
export class ListCertificateTypesUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
  ) {}

  async execute(tenant: TenantContext): Promise<CertificateTypeView[]> {
    const types = await this.certificates.listTypes(tenant.tenantScope());
    return types
      .filter((type) => canSeeType(tenant, type.code))
      .map((type) => ({
        id: type.id,
        code: type.code,
        name: type.name,
        validityDays: type.validityDays,
        hasTemplate: type.template !== null && type.template.trim() !== '',
      }));
  }
}
