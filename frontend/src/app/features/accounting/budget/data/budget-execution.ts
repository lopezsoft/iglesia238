// Pure budget execution rules: what the cash book says was really spent (or received) against a
// budget line. They take rows as arguments, so they are easy to test and mirror the API.
import { roundMoney } from '../../data/accounting-rules';
import { AccountNature, CashTransaction } from '../../data/accounting.models';
import { BudgetTotals } from './budget.models';

export interface ExecutionKey {
  readonly congregationId: number;
  readonly accountId: number;
  readonly fundId: number;
  readonly year: number;
  readonly nature: AccountNature;
}

/**
 * Executed amount of a line: the year's movements of the account and fund in the sede, leaving
 * out reversed lines and their reversals (they cancel each other). Movements in the natural
 * direction of the account add (OUT for an expense, IN for an income); the opposite subtracts.
 */
export function executedAmount(transactions: readonly CashTransaction[], key: ExecutionKey): number {
  const reversed = new Set(transactions.filter((tx) => tx.reversalOfId !== null).map((tx) => tx.reversalOfId));
  const natural = key.nature === 'EXPENSE' ? 'OUT' : 'IN';
  const prefix = `${key.year}-`;
  return roundMoney(
    transactions
      .filter(
        (tx) =>
          tx.congregationId === key.congregationId &&
          tx.accountId === key.accountId &&
          tx.fundId === key.fundId &&
          tx.postedOn.startsWith(prefix) &&
          tx.reversalOfId === null &&
          !reversed.has(tx.id),
      )
      .reduce((sum, tx) => sum + (tx.direction === natural ? tx.amount : -tx.amount), 0),
  );
}

/** executed / annual × 100 with one decimal; 0 without an annual amount. */
export function executionPct(executed: number, annual: number): number {
  return annual > 0 ? Math.round((executed / annual) * 1000) / 10 : 0;
}

export function budgetTotals(
  lines: readonly { readonly annualAmount: number; readonly monthlyAmount: number | null; readonly executed: number }[],
): BudgetTotals {
  const annual = roundMoney(lines.reduce((sum, l) => sum + l.annualAmount, 0));
  const monthly = roundMoney(lines.reduce((sum, l) => sum + (l.monthlyAmount ?? 0), 0));
  const executed = roundMoney(lines.reduce((sum, l) => sum + l.executed, 0));
  return { annual, monthly, executed, executionPct: executionPct(executed, annual), difference: roundMoney(annual - executed) };
}

/** Share of the year expected to be executed at `today`: closed months over 12. */
export function expectedExecutionPct(year: number, today: string): number {
  const [currentYear, currentMonth] = today.split('-').map(Number);
  if (year < currentYear) {
    return 100;
  }
  if (year > currentYear) {
    return 0;
  }
  return Math.round(((currentMonth - 1) / 12) * 1000) / 10;
}
