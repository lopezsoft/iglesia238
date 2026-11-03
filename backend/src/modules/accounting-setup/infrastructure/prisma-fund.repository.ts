import { Injectable } from '@nestjs/common';
import { decimalToNumber } from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  FundFacts,
  FundRecord,
  FundRepository,
} from '../application/fund.repository.js';

const SELECT = { id: true, denominationId: true, name: true, isActive: true };

/** Funds belong to the denomination, so no query here filters by congregation except the balances. */
@Injectable()
export class PrismaFundRepository implements FundRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(scope: TenantScope): Promise<FundRecord[]> {
    return this.prisma.fund.findMany({
      where: { denominationId: scope.denominationId },
      select: SELECT,
      orderBy: { id: 'asc' },
    });
  }

  find(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<FundRecord | null> {
    return clientOf(this.prisma, transaction).fund.findFirst({
      where: { id, denominationId: scope.denominationId },
      select: SELECT,
    });
  }

  async facts(
    scope: TenantScope,
    year: number,
    fundIds?: readonly number[],
  ): Promise<ReadonlyMap<number, FundFacts>> {
    const { denominationId, congregationId } = scope;
    const fundFilter = fundIds ? { fundId: { in: [...fundIds] } } : {};
    const yearRange = {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    };

    const [opening, inYear, anyMovement, budget, suggesting, nonZero] =
      await Promise.all([
        this.prisma.fundOpeningBalance.groupBy({
          by: ['fundId'],
          where: {
            denominationId,
            year,
            ...(congregationId === null ? {} : { congregationId }),
            ...fundFilter,
          },
          _sum: { amount: true },
        }),
        congregationId === null
          ? Promise.resolve([])
          : this.prisma.cashTransaction.groupBy({
              by: ['fundId'],
              where: {
                denominationId,
                congregationId,
                postedOn: yearRange,
                ...fundFilter,
              },
              _count: { _all: true },
            }),
        this.prisma.cashTransaction.groupBy({
          by: ['fundId'],
          where: { denominationId, ...fundFilter },
          _count: { _all: true },
        }),
        this.prisma.budgetLine.groupBy({
          by: ['fundId'],
          where: { denominationId, ...fundFilter },
          _count: { _all: true },
        }),
        this.prisma.account.findMany({
          where: {
            denominationId,
            defaultFundId: fundIds ? { in: [...fundIds] } : { not: null },
          },
          select: { defaultFundId: true, isActive: true },
        }),
        this.prisma.fundOpeningBalance.groupBy({
          by: ['fundId'],
          where: { denominationId, amount: { not: 0 }, ...fundFilter },
          _count: { _all: true },
        }),
      ]);

    const facts = new Map<number, FundFacts>();
    const of = (fundId: number): FundFacts =>
      facts.get(fundId) ?? {
        openingBalance: 0,
        hasMovementsInYear: false,
        hasMovements: false,
        hasBudgetLines: false,
        suggestingAccounts: 0,
        suggestingActiveAccounts: 0,
        hasOpeningBalances: false,
      };
    const patch = (fundId: number, change: Partial<FundFacts>): void => {
      facts.set(fundId, { ...of(fundId), ...change });
    };

    for (const row of opening) {
      patch(row.fundId, {
        openingBalance: row._sum.amount ? decimalToNumber(row._sum.amount) : 0,
      });
    }
    for (const row of inYear) {
      patch(row.fundId, { hasMovementsInYear: true });
    }
    for (const row of anyMovement) {
      patch(row.fundId, { hasMovements: true });
    }
    for (const row of budget) {
      patch(row.fundId, { hasBudgetLines: true });
    }
    for (const row of nonZero) {
      patch(row.fundId, { hasOpeningBalances: true });
    }
    for (const account of suggesting) {
      if (account.defaultFundId === null) {
        continue;
      }
      const current = of(account.defaultFundId);
      patch(account.defaultFundId, {
        suggestingAccounts: current.suggestingAccounts + 1,
        suggestingActiveAccounts:
          current.suggestingActiveAccounts + (account.isActive ? 1 : 0),
      });
    }
    return facts;
  }

  create(
    scope: TenantScope,
    data: { name: string; isActive: boolean },
    transaction: Transaction,
  ): Promise<FundRecord> {
    return clientOf(this.prisma, transaction).fund.create({
      data: { denominationId: scope.denominationId, ...data },
      select: SELECT,
    });
  }

  update(
    scope: TenantScope,
    id: number,
    data: { name: string; isActive: boolean },
    transaction: Transaction,
  ): Promise<FundRecord> {
    return clientOf(this.prisma, transaction).fund.update({
      where: {
        denominationId_id: { denominationId: scope.denominationId, id },
      },
      data,
      select: SELECT,
    });
  }

  async delete(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).fund.delete({
      where: {
        denominationId_id: { denominationId: scope.denominationId, id },
      },
    });
  }

  async getOpeningBalance(
    scope: TenantScope,
    fundId: number,
    year: number,
    transaction: Transaction,
  ): Promise<number> {
    const row = await clientOf(
      this.prisma,
      transaction,
    ).fundOpeningBalance.findUnique({
      where: {
        congregationId_fundId_year: {
          congregationId: scope.requireCongregationId(),
          fundId,
          year,
        },
      },
    });
    return row ? decimalToNumber(row.amount) : 0;
  }

  async setOpeningBalance(
    scope: TenantScope,
    fundId: number,
    year: number,
    amount: number,
    transaction: Transaction,
  ): Promise<void> {
    const congregationId = scope.requireCongregationId();
    await clientOf(this.prisma, transaction).fundOpeningBalance.upsert({
      where: {
        congregationId_fundId_year: { congregationId, fundId, year },
      },
      create: {
        denominationId: scope.denominationId,
        congregationId,
        fundId,
        year,
        amount,
      },
      update: { amount },
    });
  }

  async deleteOpeningBalances(
    scope: TenantScope,
    fundId: number,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).fundOpeningBalance.deleteMany({
      where: { denominationId: scope.denominationId, fundId },
    });
  }
}
