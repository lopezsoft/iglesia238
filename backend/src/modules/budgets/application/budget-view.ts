import type {
  BudgetData,
  BudgetTypeValue,
  BudgetView,
  ExecutionRow,
} from './budget.models.js';
import {
  budgetTotals,
  executedAmount,
  groupByCommittee,
  toLineRow,
} from './budget-execution.js';

export function emptyView(type: BudgetTypeValue): BudgetView {
  const none = budgetTotals([]);
  return {
    type,
    budgetId: null,
    status: null,
    incomeIncreaseRate: null,
    lines: [],
    totals: none,
    incomeTotals: none,
    expenseTotals: none,
    groups: [],
  };
}

/** The view of one budget with the execution of each line; `null` budget is the empty view. */
export function buildView(
  type: BudgetTypeValue,
  budget: BudgetData | null,
  execution: readonly ExecutionRow[],
): BudgetView {
  if (!budget) {
    return emptyView(type);
  }
  const rows = budget.lines
    .map((line) =>
      toLineRow(
        line,
        executedAmount(execution, line.accountId, line.fundId, line.nature),
        type === 'COMMITTEE'
          ? budget.lines
              .filter(
                (other) =>
                  other.accountId === line.accountId &&
                  other.fundId !== line.fundId,
              )
              .map((other) => other.fundName)
          : [],
      ),
    )
    .sort(
      (a, b) =>
        a.fundName.localeCompare(b.fundName, 'es') ||
        a.accountCode.localeCompare(b.accountCode),
    );
  return {
    type,
    budgetId: budget.id,
    status: budget.status,
    incomeIncreaseRate: budget.incomeIncreaseRate,
    lines: rows,
    totals: budgetTotals(rows),
    incomeTotals: budgetTotals(rows.filter((row) => row.nature === 'INCOME')),
    expenseTotals: budgetTotals(rows.filter((row) => row.nature === 'EXPENSE')),
    groups: type === 'COMMITTEE' ? groupByCommittee(rows) : [],
  };
}
