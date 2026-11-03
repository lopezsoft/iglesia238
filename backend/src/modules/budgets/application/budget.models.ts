export type BudgetTypeValue = 'FIXED' | 'COMMITTEE';
export type BudgetStatusValue = 'DRAFT' | 'APPROVED' | 'CLOSED';
export type AccountNatureValue = 'INCOME' | 'EXPENSE';

export interface BudgetLineData {
  readonly id: number;
  readonly budgetId: number;
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  readonly nature: AccountNatureValue;
  /** On a committee budget the fund is the committee. */
  readonly fundId: number;
  readonly fundName: string;
  readonly monthlyAmount: number | null;
  readonly annualAmount: number;
}

export interface BudgetHead {
  readonly id: number;
  readonly year: number;
  readonly type: BudgetTypeValue;
  readonly status: BudgetStatusValue;
  readonly incomeIncreaseRate: number | null;
}

export interface BudgetData extends BudgetHead {
  readonly lines: readonly BudgetLineData[];
}

/** Net movement of the year for one account, fund and direction (reversed pairs already left out). */
export interface ExecutionRow {
  readonly accountId: number;
  readonly fundId: number;
  readonly direction: 'IN' | 'OUT';
  readonly amount: number;
}

export interface MovementData {
  readonly id: number;
  readonly postedOn: string;
  readonly direction: 'IN' | 'OUT';
  readonly amount: number;
  readonly description: string;
}

export interface AccountData {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNatureValue;
  readonly isPostable: boolean;
  readonly isActive: boolean;
}

export interface FundData {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface LineWithBudget {
  readonly line: BudgetLineData;
  readonly budget: BudgetHead;
}

// ---------- Views ----------

export interface BudgetTotals {
  readonly annual: number;
  readonly monthly: number;
  readonly executed: number;
  /** executed / annual x 100 with one decimal; 0 without an annual amount. */
  readonly executionPct: number;
  /** annual - executed. */
  readonly difference: number;
}

export interface BudgetLineRow {
  readonly id: number;
  readonly budgetId: number;
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  readonly nature: AccountNatureValue;
  readonly fundId: number;
  readonly fundName: string;
  readonly monthlyAmount: number | null;
  readonly annualAmount: number;
  /** Net movements of the year on the account and fund in the sede. */
  readonly executed: number;
  readonly executionPct: number;
  readonly overExecuted: boolean;
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
  readonly type: BudgetTypeValue;
  /** Null when the sede has no budget of this type for the year (the first line creates it). */
  readonly budgetId: number | null;
  readonly status: BudgetStatusValue | null;
  readonly incomeIncreaseRate: number | null;
  readonly lines: readonly BudgetLineRow[];
  /** Income and expense lines together. */
  readonly totals: BudgetTotals;
  readonly incomeTotals: BudgetTotals;
  readonly expenseTotals: BudgetTotals;
  /** Committee budgets only: lines grouped by committee (fund), with subtotals. */
  readonly groups: readonly CommitteeGroup[];
}

export interface BudgetAccountOption {
  readonly id: number;
  /** "410505 · Diezmos". */
  readonly label: string;
  readonly nature: AccountNatureValue;
}

export interface BudgetFundOption {
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
  /** Share of the year elapsed (closed months), 0-100. */
  readonly expectedPct: number;
  readonly fixed: BudgetView;
  readonly committee: BudgetView;
  readonly accounts: readonly BudgetAccountOption[];
  readonly funds: readonly BudgetFundOption[];
}

export interface BudgetMonthRow {
  readonly month: number;
  /** Monthly value of the line, or a twelfth of the annual one. */
  readonly planned: number;
  readonly executed: number;
}

export interface BudgetLineDetail {
  readonly line: BudgetLineRow;
  readonly year: number;
  readonly type: BudgetTypeValue;
  readonly status: BudgetStatusValue;
  readonly months: readonly BudgetMonthRow[];
  /** Newest first, at most 25. */
  readonly movements: readonly MovementData[];
}

export interface SaveBudgetLineCommand {
  readonly year: number;
  readonly type: BudgetTypeValue;
  readonly accountId: number;
  readonly fundId: number;
  readonly annualAmount: number;
  readonly monthlyAmount: number | null;
}

export interface CopyBudgetCommand {
  readonly type: BudgetTypeValue;
  readonly sourceYear: number;
  readonly targetYear: number;
  /** Fraction applied to every copied amount (0.05 = +5 %); null copies as they are. */
  readonly adjustmentRate: number | null;
}

export interface CopyBudgetResult {
  readonly budgetId: number;
  readonly copied: number;
  /** Lines already in the target, or whose account or fund is no longer active. */
  readonly skipped: number;
}
