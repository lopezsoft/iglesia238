import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { ApplicationQueueView } from './application-views.js';
import { ApplicationAssembler } from './application.assembler.js';
import {
  APPLICATIONS_REPOSITORY,
  type ApplicationListQuery,
  type ApplicationsRepository,
} from './ports/applications.repository.js';

@Injectable()
export class ListApplicationsUseCase {
  constructor(
    @Inject(APPLICATIONS_REPOSITORY)
    private readonly applications: ApplicationsRepository,
    private readonly assembler: ApplicationAssembler,
  ) {}

  async execute(
    tenant: TenantContext,
    query: ApplicationListQuery,
  ): Promise<ApplicationQueueView> {
    const scope = tenant.tenantScope();
    if (
      scope.congregationId !== null &&
      query.congregationId !== null &&
      query.congregationId !== scope.congregationId
    ) {
      // A sede of another congregation does not exist for this reviewer.
      throw new NotFoundDomainException('La sede indicada no existe.');
    }

    const result = await this.applications.list(scope, query);
    return {
      items: await this.assembler.summaries(scope, result.items),
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      counts: result.counts,
    };
  }
}
