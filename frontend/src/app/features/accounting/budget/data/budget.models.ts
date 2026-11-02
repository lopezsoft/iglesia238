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
  /** Year's non-reversed cash movements of the account and fund in the sede. */
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
  readonly lines: readonly BudgetLineRow[];
  readonly totals: BudgetTotals;
  /** Committee budgets only: lines grouped by committee (fund), with subtotals. */
  readonly groups: readonly CommitteeGroup[];
}

export interface BudgetOption {
  readonly id: number;
  readonly label: string;
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
  /** "Ejecución real al 31/10/2026 (10 de 12 meses)." */
  readonly cutoffLabel: string;
  readonly fixed: BudgetView;
  readonly committee: BudgetView;
  /** Active postable accounts ("410505 · Diezmos"). */
  readonly accounts: readonly BudgetOption[];
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
