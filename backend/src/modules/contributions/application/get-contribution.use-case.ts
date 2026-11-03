import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { toContributionDetail } from './contribution-mappers.js';
import type { ContributionDetail } from './contribution.models.js';
import {
  CONTRIBUTIONS_REPOSITORY,
  type ContributionsRepository,
} from './contributions.repository.js';

/** One contribution with who recorded it, its receipt, its consolidation and its settlement. */
@Injectable()
export class GetContributionUseCase {
  constructor(
    @Inject(CONTRIBUTIONS_REPOSITORY)
    private readonly repository: ContributionsRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
  ): Promise<ContributionDetail> {
    const record = await this.repository.findById(tenant.tenantScope(), id);
    if (!record) {
      throw new NotFoundDomainException('El aporte no existe.');
    }
    return toContributionDetail(record);
  }
}
