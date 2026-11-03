import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import type { TenantScope } from '../../common/tenancy/tenant-scope.js';
import type { CongregationLookup } from '../../common/accounting/congregation-lookup.port.js';

@Injectable()
export class PrismaCongregationLookup implements CongregationLookup {
  constructor(private readonly prisma: PrismaService) {}

  async nameOf(
    scope: TenantScope,
    congregationId: number,
  ): Promise<string | null> {
    const congregation = await this.prisma.congregation.findFirst({
      where: { id: congregationId, denominationId: scope.denominationId },
      select: { name: true },
    });
    return congregation?.name ?? null;
  }
}
