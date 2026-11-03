import { Injectable } from '@nestjs/common';
import type { PeriodRecord } from '../../../common/accounting/period-view.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { PeriodRepository } from '../application/period.repository.js';

const SELECT = {
  id: true,
  year: true,
  month: true,
  status: true,
  closedAt: true,
};

@Injectable()
export class PrismaPeriodRepository implements PeriodRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: TenantScope): Promise<PeriodRecord[]> {
    return this.prisma.accountingPeriod.findMany({
      where: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
      },
      select: SELECT,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  create(
    scope: TenantScope,
    data: { year: number; month: number },
    transaction: Transaction,
  ): Promise<PeriodRecord> {
    return clientOf(this.prisma, transaction).accountingPeriod.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        year: data.year,
        month: data.month,
      },
      select: SELECT,
    });
  }
}
