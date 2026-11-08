import { Inject, Injectable } from '@nestjs/common';
import { mapPage, type Page } from '../../../../common/pagination/page.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { readScope, toCertificateListItem } from '../certificate-mappers.js';
import type {
  CertificateFilter,
  CertificateListItemView,
  PageParams,
} from '../certificate.models.js';
import { restrictedFilter } from '../certificate-access.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

export interface ListCertificatesInput {
  readonly filter: CertificateFilter;
  readonly paging: PageParams;
  /** A denomination scope may narrow the list to one of its sedes. */
  readonly congregationId?: number;
}

/** Certificates of the active sede, or of every sede of the denomination in a denomination scope. */
@Injectable()
export class ListCertificatesUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    input: ListCertificatesInput,
  ): Promise<Page<CertificateListItemView>> {
    const scope = readScope(tenant, input.congregationId);
    const page = await this.certificates.list(
      scope,
      restrictedFilter(tenant, input.filter),
      input.paging,
    );
    return mapPage(page, toCertificateListItem);
  }
}
