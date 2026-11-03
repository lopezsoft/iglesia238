import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { applicationNotFound } from './application-errors.js';
import type { ApplicationDetailView } from './application-views.js';
import { ApplicationAssembler } from './application.assembler.js';
import {
  APPLICATIONS_REPOSITORY,
  type ApplicationsRepository,
} from './ports/applications.repository.js';

@Injectable()
export class GetApplicationUseCase {
  constructor(
    @Inject(APPLICATIONS_REPOSITORY)
    private readonly applications: ApplicationsRepository,
    private readonly assembler: ApplicationAssembler,
  ) {}

  async execute(
    tenant: TenantContext,
    id: number,
  ): Promise<ApplicationDetailView> {
    const scope = tenant.tenantScope();
    const record = await this.applications.findById(scope, id);
    if (!record) {
      throw applicationNotFound();
    }
    return this.assembler.detail(scope, record);
  }
}
