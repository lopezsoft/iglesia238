import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  BudgetHead,
  BudgetLineData,
  BudgetStatusValue,
  BudgetTypeValue,
} from '../application/budget.models.js';
import type { BudgetWriter, LineValues } from '../application/budget.ports.js';
import { HEAD_SELECT, LINE_SELECT, toHead, toLine } from './budget-records.js';

@Injectable()
export class PrismaBudgetWriter
  extends TenantScopedRepository
  implements BudgetWriter
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createBudget(
    scope: TenantScope,
    year: number,
    type: BudgetTypeValue,
    transaction: Transaction,
  ): Promise<BudgetHead> {
    const row = await clientOf(this.prisma, transaction).budget.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: scope.requireCongregationId(),
        year,
        type,
        status: 'DRAFT',
      },
      select: HEAD_SELECT,
    });
    return toHead(row);
  }

  async createLine(
    scope: TenantScope,
    budgetId: number,
    values: LineValues,
    transaction: Transaction,
  ): Promise<BudgetLineData> {
    const row = await clientOf(this.prisma, transaction).budgetLine.create({
      data: {
        denominationId: scope.denominationId,
        budgetId,
        accountId: values.accountId,
        fundId: values.fundId,
        annualAmount: values.annualAmount,
        monthlyAmount: values.monthlyAmount,
      },
      select: LINE_SELECT,
    });
    return toLine(row);
  }

  async updateLine(
    scope: TenantScope,
    lineId: number,
    values: LineValues,
    transaction: Transaction,
  ): Promise<BudgetLineData | null> {
    const client = clientOf(this.prisma, transaction);
    const where = this.lineWhere(scope, lineId);
    const changed = await client.budgetLine.updateMany({
      where,
      data: {
        accountId: values.accountId,
        fundId: values.fundId,
        annualAmount: values.annualAmount,
        monthlyAmount: values.monthlyAmount,
      },
    });
    if (changed.count === 0) {
      return null;
    }
    const row = await client.budgetLine.findFirst({
      where,
      select: LINE_SELECT,
    });
    return row ? toLine(row) : null;
  }

  async deleteLine(
    scope: TenantScope,
    lineId: number,
    transaction: Transaction,
  ): Promise<boolean> {
    const removed = await clientOf(
      this.prisma,
      transaction,
    ).budgetLine.deleteMany({
      where: this.lineWhere(scope, lineId),
    });
    return removed.count > 0;
  }

  async updateBudget(
    scope: TenantScope,
    budgetId: number,
    patch: {
      status?: BudgetStatusValue;
      incomeIncreaseRate?: number | null;
    },
    transaction: Transaction,
  ): Promise<BudgetHead | null> {
    const client = clientOf(this.prisma, transaction);
    const where = this.scoped(scope, { id: budgetId });
    const changed = await client.budget.updateMany({
      where,
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.incomeIncreaseRate !== undefined
          ? { incomeIncreaseRate: patch.incomeIncreaseRate }
          : {}),
      },
    });
    if (changed.count === 0) {
      return null;
    }
    const row = await client.budget.findFirst({ where, select: HEAD_SELECT });
    return row ? toHead(row) : null;
  }

  /** A line belongs to the sede through its budget. */
  private lineWhere(scope: TenantScope, lineId: number) {
    return {
      id: lineId,
      denominationId: scope.denominationId,
      budget: { congregationId: scope.requireCongregationId() },
    };
  }
}
