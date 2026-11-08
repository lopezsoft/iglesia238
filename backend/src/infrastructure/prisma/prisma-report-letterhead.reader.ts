import { Injectable } from '@nestjs/common';
import type { ReportLetterheadReader } from '../../common/reports/report-letterhead.js';
import type { ReportLetterhead } from '../../common/reports/report-pdf.js';
import type { TenantScope } from '../../common/tenancy/tenant-scope.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaReportLetterheadReader implements ReportLetterheadReader {
  constructor(private readonly prisma: PrismaService) {}

  async find(scope: TenantScope): Promise<ReportLetterhead | null> {
    const congregation = await this.prisma.congregation.findFirst({
      where: {
        id: scope.requireCongregationId(),
        denominationId: scope.denominationId,
      },
      select: {
        name: true,
        denomination: { select: { name: true } },
        legalEntity: { select: { legalName: true, taxId: true } },
      },
    });
    return congregation
      ? {
          denominationName: congregation.denomination.name,
          legalName: congregation.legalEntity.legalName,
          taxId: congregation.legalEntity.taxId,
          congregationName: congregation.name,
        }
      : null;
  }
}
