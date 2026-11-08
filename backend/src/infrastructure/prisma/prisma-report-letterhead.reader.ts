import { Injectable } from '@nestjs/common';
import type { ReportLetterheadReader } from '../../common/reports/report-letterhead.js';
import type { ReportLetterhead } from '../../common/reports/report-pdf.js';
import type { TenantScope } from '../../common/tenancy/tenant-scope.js';
import { PrismaService } from './prisma.service.js';

/** What the letterhead says when the report covers every sede of the denomination. */
export const WHOLE_DENOMINATION_LABEL = 'Todas las sedes';

@Injectable()
export class PrismaReportLetterheadReader implements ReportLetterheadReader {
  constructor(private readonly prisma: PrismaService) {}

  async find(scope: TenantScope): Promise<ReportLetterhead | null> {
    if (scope.congregationId === null) {
      return this.findDenomination(scope.denominationId);
    }
    const congregation = await this.prisma.congregation.findFirst({
      where: {
        id: scope.congregationId,
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

  /** A denomination has several legal entities, so its letterhead carries only its own name. */
  private async findDenomination(
    denominationId: number,
  ): Promise<ReportLetterhead | null> {
    const denomination = await this.prisma.denomination.findFirst({
      where: { id: denominationId },
      select: { name: true },
    });
    return denomination
      ? {
          denominationName: denomination.name,
          legalName: null,
          taxId: null,
          congregationName: WHOLE_DENOMINATION_LABEL,
        }
      : null;
  }
}
