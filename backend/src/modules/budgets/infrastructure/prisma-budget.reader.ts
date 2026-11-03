import { Injectable } from '@nestjs/common';
import {
  decimalToNumber,
  parseIsoDate,
  toIsoDate,
} from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  AccountData,
  BudgetData,
  BudgetTypeValue,
  ExecutionRow,
  FundData,
  LineWithBudget,
  MovementData,
} from '../application/budget.models.js';
import type { BudgetReader } from '../application/budget.ports.js';
import {
  BUDGET_SELECT,
  HEAD_SELECT,
  LINE_SELECT,
  toBudget,
  toHead,
  toLine,
} from './budget-records.js';

const ACCOUNT_SELECT = {
  id: true,
  code: true,
  name: true,
  nature: true,
  isPostable: true,
  isActive: true,
} as const;

/** Movements that count as executed: neither a reversal nor a movement that was reversed. */
const COUNTED = { reversalOfId: null, reversedBy: null } as const;

@Injectable()
export class PrismaBudgetReader
  extends TenantScopedRepository
  implements BudgetReader
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findCongregationName(scope: TenantScope): Promise<string | null> {
    const row = await this.prisma.congregation.findFirst({
      where: {
        id: scope.requireCongregationId(),
        denominationId: scope.denominationId,
      },
      select: { name: true },
    });
    return row?.name ?? null;
  }

  async findBudgets(scope: TenantScope, year: number): Promise<BudgetData[]> {
    const rows = await this.prisma.budget.findMany({
      where: this.scoped(scope, { year }),
      select: BUDGET_SELECT,
    });
    return rows.map(toBudget);
  }

  async findBudget(
    scope: TenantScope,
    year: number,
    type: BudgetTypeValue,
    transaction?: Transaction,
  ): Promise<BudgetData | null> {
    const row = await clientOf(this.prisma, transaction).budget.findFirst({
      where: this.scoped(scope, { year, type }),
      select: BUDGET_SELECT,
    });
    return row ? toBudget(row) : null;
  }

  async findBudgetById(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<BudgetData | null> {
    const row = await clientOf(this.prisma, transaction).budget.findFirst({
      where: this.scoped(scope, { id }),
      select: BUDGET_SELECT,
    });
    return row ? toBudget(row) : null;
  }

  async findYears(scope: TenantScope): Promise<number[]> {
    const rows = await this.prisma.budget.findMany({
      where: this.scoped(scope),
      distinct: ['year'],
      select: { year: true },
    });
    return rows.map((row) => row.year);
  }

  async findLine(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<LineWithBudget | null> {
    const row = await clientOf(this.prisma, transaction).budgetLine.findFirst({
      // A line has no congregation: it belongs to the sede through its budget.
      where: {
        id,
        denominationId: scope.denominationId,
        budget: { congregationId: scope.requireCongregationId() },
      },
      select: { ...LINE_SELECT, budget: { select: HEAD_SELECT } },
    });
    return row ? { line: toLine(row), budget: toHead(row.budget) } : null;
  }

  async findExecution(
    scope: TenantScope,
    year: number,
  ): Promise<ExecutionRow[]> {
    const rows = await this.prisma.cashTransaction.groupBy({
      by: ['accountId', 'fundId', 'direction'],
      where: this.scoped(scope, { ...COUNTED, ...yearRange(year) }),
      _sum: { amount: true },
    });
    return rows.map((row) => ({
      accountId: row.accountId,
      fundId: row.fundId,
      direction: row.direction,
      amount: row._sum.amount ? decimalToNumber(row._sum.amount) : 0,
    }));
  }

  async findMovements(
    scope: TenantScope,
    year: number,
    accountId: number,
    fundId: number,
  ): Promise<MovementData[]> {
    const rows = await this.prisma.cashTransaction.findMany({
      where: this.scoped(scope, {
        ...COUNTED,
        ...yearRange(year),
        accountId,
        fundId,
      }),
      orderBy: [{ postedOn: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        postedOn: true,
        direction: true,
        amount: true,
        description: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      postedOn: toIsoDate(row.postedOn),
      direction: row.direction,
      amount: decimalToNumber(row.amount),
      description: row.description,
    }));
  }

  async listPostableAccounts(denominationId: number): Promise<AccountData[]> {
    return await this.prisma.account.findMany({
      where: { denominationId, isPostable: true },
      orderBy: { code: 'asc' },
      select: ACCOUNT_SELECT,
    });
  }

  async listActiveFunds(denominationId: number): Promise<FundData[]> {
    return await this.prisma.fund.findMany({
      where: { denominationId, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true },
    });
  }

  async findAccount(
    denominationId: number,
    id: number,
    transaction?: Transaction,
  ): Promise<AccountData | null> {
    return await clientOf(this.prisma, transaction).account.findFirst({
      where: { denominationId, id },
      select: ACCOUNT_SELECT,
    });
  }

  async findFund(
    denominationId: number,
    id: number,
    transaction?: Transaction,
  ): Promise<FundData | null> {
    return await clientOf(this.prisma, transaction).fund.findFirst({
      where: { denominationId, id },
      select: { id: true, name: true, isActive: true },
    });
  }
}

function yearRange(year: number) {
  return {
    postedOn: {
      gte: parseIsoDate(`${year}-01-01`),
      lte: parseIsoDate(`${year}-12-31`),
    },
  };
}
