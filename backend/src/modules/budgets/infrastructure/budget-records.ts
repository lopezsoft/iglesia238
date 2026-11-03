import {
  decimalToNumber,
  decimalToNumberOrNull,
} from '../../../common/mappers/value-mappers.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type {
  BudgetData,
  BudgetHead,
  BudgetLineData,
} from '../application/budget.models.js';

export const LINE_SELECT = {
  id: true,
  budgetId: true,
  accountId: true,
  fundId: true,
  monthlyAmount: true,
  annualAmount: true,
  account: { select: { code: true, name: true, nature: true } },
  fund: { select: { name: true } },
} satisfies Prisma.BudgetLineSelect;

export const HEAD_SELECT = {
  id: true,
  year: true,
  type: true,
  status: true,
  incomeIncreaseRate: true,
} satisfies Prisma.BudgetSelect;

export const BUDGET_SELECT = {
  ...HEAD_SELECT,
  budgetLines: { select: LINE_SELECT, orderBy: { id: 'asc' } },
} satisfies Prisma.BudgetSelect;

export type LineRow = Prisma.BudgetLineGetPayload<{
  select: typeof LINE_SELECT;
}>;
export type HeadRow = Prisma.BudgetGetPayload<{ select: typeof HEAD_SELECT }>;
export type BudgetRow = Prisma.BudgetGetPayload<{
  select: typeof BUDGET_SELECT;
}>;

export function toLine(row: LineRow): BudgetLineData {
  return {
    id: row.id,
    budgetId: row.budgetId,
    accountId: row.accountId,
    accountCode: row.account.code,
    accountName: row.account.name,
    nature: row.account.nature,
    fundId: row.fundId,
    fundName: row.fund.name,
    monthlyAmount: decimalToNumberOrNull(row.monthlyAmount),
    annualAmount: decimalToNumber(row.annualAmount),
  };
}

export function toHead(row: HeadRow): BudgetHead {
  return {
    id: row.id,
    year: row.year,
    type: row.type,
    status: row.status,
    incomeIncreaseRate: decimalToNumberOrNull(row.incomeIncreaseRate),
  };
}

export function toBudget(row: BudgetRow): BudgetData {
  return { ...toHead(row), lines: row.budgetLines.map(toLine) };
}
