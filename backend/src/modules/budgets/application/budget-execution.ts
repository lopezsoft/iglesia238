import {
  fromCents,
  roundMoney,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import type {
  AccountNatureValue,
  BudgetLineData,
  BudgetLineRow,
  BudgetTotals,
  CommitteeGroup,
  ExecutionRow,
  MovementData,
} from './budget.models.js';

// Pure budget rules: what the cash book says was really spent (or received) against a budget line.
// Money is added in cents, so a sum of two-decimal amounts never drifts.

function naturalDirection(nature: AccountNatureValue): 'IN' | 'OUT' {
  return nature === 'EXPENSE' ? 'OUT' : 'IN';
}

/**
 * Executed amount of a line from the net movements of its account and fund. Movements in the natural
 * direction of the account add (OUT for an expense, IN for an income); the opposite one subtracts.
 */
export function executedAmount(
  rows: readonly ExecutionRow[],
  accountId: number,
  fundId: number,
  nature: AccountNatureValue,
): number {
  const natural = naturalDirection(nature);
  return fromCents(
    rows
      .filter((row) => row.accountId === accountId && row.fundId === fundId)
      .reduce(
        (sum, row) =>
          sum + (row.direction === natural ? 1 : -1) * toCents(row.amount),
        0,
      ),
  );
}

/** Executed amount of a line from its own movements (detail view). */
export function executedFromMovements(
  movements: readonly Pick<MovementData, 'direction' | 'amount'>[],
  nature: AccountNatureValue,
): number {
  const natural = naturalDirection(nature);
  return fromCents(
    movements.reduce(
      (sum, move) =>
        sum + (move.direction === natural ? 1 : -1) * toCents(move.amount),
      0,
    ),
  );
}

/** executed / annual x 100 with one decimal; 0 without an annual amount. */
export function executionPct(executed: number, annual: number): number {
  return annual > 0 ? Math.round((executed / annual) * 1000) / 10 : 0;
}

export function budgetTotals(
  lines: readonly {
    readonly annualAmount: number;
    readonly monthlyAmount: number | null;
    readonly executed: number;
  }[],
): BudgetTotals {
  const sum = (pick: (line: (typeof lines)[number]) => number) =>
    fromCents(lines.reduce((total, line) => total + toCents(pick(line)), 0));
  const annual = sum((line) => line.annualAmount);
  const executed = sum((line) => line.executed);
  return {
    annual,
    monthly: sum((line) => line.monthlyAmount ?? 0),
    executed,
    executionPct: executionPct(executed, annual),
    difference: roundMoney(annual - executed),
  };
}

/** Share of the year expected to be executed at `today`: closed months over 12. */
export function expectedExecutionPct(year: number, today: string): number {
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  if (year < currentYear) {
    return 100;
  }
  if (year > currentYear) {
    return 0;
  }
  return Math.round(((currentMonth - 1) / 12) * 1000) / 10;
}

export function toLineRow(
  line: BudgetLineData,
  executed: number,
  sharedWith: readonly string[],
): BudgetLineRow {
  const pct = executionPct(executed, line.annualAmount);
  return {
    id: line.id,
    budgetId: line.budgetId,
    accountId: line.accountId,
    accountCode: line.accountCode,
    accountName: line.accountName,
    nature: line.nature,
    fundId: line.fundId,
    fundName: line.fundName,
    monthlyAmount: line.monthlyAmount,
    annualAmount: line.annualAmount,
    executed,
    executionPct: pct,
    overExecuted: pct > 100,
    difference: roundMoney(line.annualAmount - executed),
    sharedWith,
  };
}

export function groupByCommittee(
  rows: readonly BudgetLineRow[],
): CommitteeGroup[] {
  const groups = new Map<number, BudgetLineRow[]>();
  for (const row of rows) {
    groups.set(row.fundId, [...(groups.get(row.fundId) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([fundId, lines]) => ({
      fundId,
      fundName: lines[0].fundName,
      lines,
      totals: budgetTotals(lines),
    }))
    .sort((a, b) => a.fundName.localeCompare(b.fundName, 'es'));
}

/** Twelve months with what was planned and what was executed; `planned` is the monthly value or a twelfth. */
export function monthlyBreakdown(
  line: Pick<BudgetLineData, 'annualAmount' | 'monthlyAmount' | 'nature'>,
  movements: readonly MovementData[],
): { month: number; planned: number; executed: number }[] {
  const planned = roundMoney(line.monthlyAmount ?? line.annualAmount / 12);
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const ofMonth = movements.filter(
      (move) => Number(move.postedOn.slice(5, 7)) === month,
    );
    return {
      month,
      planned,
      executed: executedFromMovements(ofMonth, line.nature),
    };
  });
}
