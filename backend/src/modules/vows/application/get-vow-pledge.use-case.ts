import { Inject, Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { toVowPledgeDetail } from './vow-pledge-mappers.js';
import type { VowPledgeDetail } from './vow-pledge.models.js';
import { VOWS_REPOSITORY, type VowsRepository } from './vows.repository.js';

/**
 * Pledge with its payments. The pledge must belong to the scope (another sede or denomination
 * answers 404), but its payments are listed from the whole denomination: a member who moved to
 * another sede keeps paying a pledge made in the previous one.
 */
@Injectable()
export class GetVowPledgeUseCase {
  constructor(
    @Inject(VOWS_REPOSITORY) private readonly repository: VowsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext, id: number): Promise<VowPledgeDetail> {
    const record = await this.repository.findById(tenant.tenantScope(), id);
    if (!record) {
      throw new NotFoundDomainException(
        'La promesa de voto no existe en la sede.',
      );
    }
    return toVowPledgeDetail(record, this.clock.today());
  }
}
