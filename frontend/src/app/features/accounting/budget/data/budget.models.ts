import { AccountNature, BudgetStatus, BudgetType } from '../../data/accounting.models';

export interface BudgetTotals {
  readonly annual: number;
  readonly monthly: number;
  readonly executed: number;
  /** executed / annual × 100 (0 when there is no annual amount). */
  readonly executionPct: number;
  readonly difference: number;
}

export interface BudgetLineRow {
  readonly id: number;
  readonly budgetId: number;
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  readonly nature: AccountNature;
  /** On a committee budget the fund is the committee. */
  readonly fundId: number;
  readonly fundName: string;
  readonly monthlyAmount: number | null;
  readonly annualAmount: number;
  /** Year's net cash movements of the account and fund in the sede (reversed pairs left out). */
  readonly executed: number;
  readonly executionPct: number;
  readonly overExecuted: boolean;
  /** annual − executed (negative when over-executed). */
  readonly difference: number;
  /** Other committees of the same budget with a line on the same account. */
  readonly sharedWith: readonly string[];
}

export interface CommitteeGroup {
  readonly fundId: number;
  readonly fundName: string;
  readonly lines: readonly BudgetLineRow[];
  readonly totals: BudgetTotals;
}

export interface BudgetView {
  readonly type: BudgetType;
  /** Null when the sede has no budget of this type for the year (the first line creates it). */
  readonly budgetId: number | null;
  readonly status: BudgetStatus | null;
  /** Expected growth of the income as a fraction (0.05 = 5 %). */
  readonly incomeIncreaseRate: number | null;
  readonly lines: readonly BudgetLineRow[];
  /** Income and expense lines together. */
  readonly totals: BudgetTotals;
  readonly incomeTotals: BudgetTotals;
  readonly expenseTotals: BudgetTotals;
  /** Committee budgets only: lines grouped by committee (fund), with subtotals. */
  readonly groups: readonly CommitteeGroup[];
}

export interface BudgetOption {
  readonly id: number;
  readonly label: string;
}

export interface BudgetAccountOption extends BudgetOption {
  readonly nature: AccountNature;
}

export interface BudgetOverview {
  readonly today: string;
  readonly year: number;
  /** Newest first. */
  readonly years: readonly number[];
  readonly congregationScoped: boolean;
  readonly congregationName: string;
  /** Share of the year elapsed (closed months), 0–100. */
  readonly expectedPct: number;
  readonly fixed: BudgetView;
  readonly committee: BudgetView;
  /** Active postable accounts ("410505 · Diezmos"). */
  readonly accounts: readonly BudgetAccountOption[];
  /** Active funds (committees on the committee budget). */
  readonly funds: readonly BudgetOption[];
}

export interface SaveBudgetLineCommand {
  /** Null to add a line. */
  readonly id: number | null;
  readonly year: number;
  readonly type: BudgetType;
  readonly accountId: number;
  readonly fundId: number;
  readonly annualAmount: number;
  readonly monthlyAmount: number | null;
}

/** Header of a budget, returned by the status and settings changes. */
export interface BudgetHead {
  readonly id: number;
  readonly year: number;
  readonly type: BudgetType;
  readonly status: BudgetStatus;
  readonly incomeIncreaseRate: number | null;
}

export interface CopyBudgetCommand {
  readonly type: BudgetType;
  readonly sourceYear: number;
  readonly targetYear: number;
  /** Fraction applied to every copied amount (0.05 = +5 %); null copies them as they are. */
  readonly adjustmentRate: number | null;
}

export interface CopyBudgetResult {
  readonly budgetId: number;
  readonly copied: number;
  /** Lines already in the target, or whose account or fund is no longer active. */
  readonly skipped: number;
}

export interface BudgetMonthRow {
  readonly month: number;
  /** Monthly value of the line, or a twelfth of the annual one. */
  readonly planned: number;
  readonly executed: number;
}

export interface BudgetMovement {
  readonly id: number;
  readonly postedOn: string;
  readonly direction: 'IN' | 'OUT';
  readonly amount: number;
  readonly description: string;
}

export interface BudgetLineDetail {
  readonly line: BudgetLineRow;
  readonly year: number;
  readonly type: BudgetType;
  readonly status: BudgetStatus;
  readonly months: readonly BudgetMonthRow[];
  /** Newest first. */
  readonly movements: readonly BudgetMovement[];
}

/** "Ejecución real al 31/10/2026 (10 de 12 meses)." Presentation text built from the year and today. */
export function cutoffLabel(year: number, today: string): string {
  const currentYear = Number(today.slice(0, 4));
  if (year < currentYear) {
    return `Ejecución real al cierre del 31/12/${year}.`;
  }
  if (year > currentYear) {
    return 'El año aún no comienza: sin ejecución registrada.';
  }
  const month = today.slice(5, 7);
  const dayOfMonth = today.slice(8, 10);
  const closedMonths = Number(month) - 1;
  return `Ejecución real al ${dayOfMonth}/${month}/${year}; esperada a la fecha: ${closedMonths} de 12 meses cerrados.`;
}
