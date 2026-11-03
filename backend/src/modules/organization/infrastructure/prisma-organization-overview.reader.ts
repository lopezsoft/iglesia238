import { Injectable } from '@nestjs/common';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  OrganizationCounts,
  OrganizationOverviewReader,
} from '../application/organization.ports.js';

@Injectable()
export class PrismaOrganizationOverviewReader implements OrganizationOverviewReader {
  constructor(private readonly prisma: PrismaService) {}

  async read(scope: TenantScope): Promise<OrganizationCounts | null> {
    const denominationId = scope.denominationId;
    const live = { denominationId, deletedAt: null };
    const [
      denomination,
      totalCongregations,
      activeCongregations,
      accepting,
      legalEntities,
      districts,
    ] = await Promise.all([
      this.prisma.denomination.findFirst({
        where: { id: denominationId, deletedAt: null },
        select: { name: true },
      }),
      this.prisma.congregation.count({ where: live }),
      this.prisma.congregation.count({ where: { ...live, isActive: true } }),
      this.prisma.congregation.count({
        where: { ...live, isActive: true, acceptsApplications: true },
      }),
      this.prisma.legalEntity.count({ where: live }),
      this.prisma.district.count({ where: { denominationId } }),
    ]);
    if (!denomination) {
      return null;
    }
    return {
      denominationName: denomination.name,
      activeCongregations,
      totalCongregations,
      acceptingApplications: accepting,
      legalEntities,
      districts,
    };
  }
}
