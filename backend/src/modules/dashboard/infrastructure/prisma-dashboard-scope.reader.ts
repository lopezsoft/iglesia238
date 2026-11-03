import { Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { DashboardScopeInfo } from '../application/dashboard.types.js';
import type { DashboardScopeReader } from '../application/ports/dashboard-scope.reader.js';

const PLATFORM_LABEL = 'Plataforma';

@Injectable()
export class PrismaDashboardScopeReader implements DashboardScopeReader {
  constructor(private readonly prisma: PrismaService) {}

  async describe(tenant: TenantContext): Promise<DashboardScopeInfo> {
    if (tenant.denominationId === null) {
      return {
        kind: tenant.kind,
        label: PLATFORM_LABEL,
        denominationName: null,
      };
    }

    const denomination = await this.prisma.denomination.findFirst({
      where: { id: tenant.denominationId },
      select: { name: true },
    });
    const denominationName = denomination?.name ?? null;
    if (tenant.congregationId === null) {
      return {
        kind: tenant.kind,
        label: denominationName ?? 'Denominación',
        denominationName,
      };
    }

    // The denomination is part of the filter: a congregation of another one is never named.
    const congregation = await this.prisma.congregation.findFirst({
      where: {
        id: tenant.congregationId,
        denominationId: tenant.denominationId,
      },
      select: { name: true },
    });
    return {
      kind: tenant.kind,
      label: congregation?.name ?? 'Sede',
      denominationName,
    };
  }
}
