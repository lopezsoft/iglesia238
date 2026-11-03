import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type {
  AccountData,
  BudgetData,
  BudgetHead,
  BudgetLineData,
  BudgetStatusValue,
  BudgetTypeValue,
  ExecutionRow,
  FundData,
  LineWithBudget,
  MovementData,
} from './budget.models.js';

export const BUDGET_READER = Symbol('BUDGET_READER');
export const BUDGET_WRITER = Symbol('BUDGET_WRITER');

export interface LineValues {
  readonly accountId: number;
  readonly fundId: number;
  readonly annualAmount: number;
  readonly monthlyAmount: number | null;
}

/**
 * Reads of the budgets. Budgets belong to a sede: every method that touches them takes a
 * congregation TenantScope. Accounts and funds belong to the denomination.
 */
export interface BudgetReader {
  findCongregationName(scope: TenantScope): Promise<string | null>;
  /** Both budgets (fixed and committee) of the year, with their lines. */
  findBudgets(scope: TenantScope, year: number): Promise<BudgetData[]>;
  findBudget(
    scope: TenantScope,
    year: number,
    type: BudgetTypeValue,
    transaction?: Transaction,
  ): Promise<BudgetData | null>;
  findBudgetById(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<BudgetData | null>;
  findYears(scope: TenantScope): Promise<number[]>;
  findLine(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<LineWithBudget | null>;
  /** Net movements of the sede in the year, grouped by account, fund and direction. */
  findExecution(scope: TenantScope, year: number): Promise<ExecutionRow[]>;
  /** Movements of one account and fund in the year that count as executed (reversed pairs excluded). */
  findMovements(
    scope: TenantScope,
    year: number,
    accountId: number,
    fundId: number,
  ): Promise<MovementData[]>;
  listPostableAccounts(denominationId: number): Promise<AccountData[]>;
  listActiveFunds(denominationId: number): Promise<FundData[]>;
  findAccount(
    denominationId: number,
    id: number,
    transaction?: Transaction,
  ): Promise<AccountData | null>;
  findFund(
    denominationId: number,
    id: number,
    transaction?: Transaction,
  ): Promise<FundData | null>;
}

export interface BudgetWriter {
  createBudget(
    scope: TenantScope,
    year: number,
    type: BudgetTypeValue,
    transaction: Transaction,
  ): Promise<BudgetHead>;
  createLine(
    scope: TenantScope,
    budgetId: number,
    values: LineValues,
    transaction: Transaction,
  ): Promise<BudgetLineData>;
  updateLine(
    scope: TenantScope,
    lineId: number,
    values: LineValues,
    transaction: Transaction,
  ): Promise<BudgetLineData | null>;
  deleteLine(
    scope: TenantScope,
    lineId: number,
    transaction: Transaction,
  ): Promise<boolean>;
  updateBudget(
    scope: TenantScope,
    budgetId: number,
    patch: {
      status?: BudgetStatusValue;
      incomeIncreaseRate?: number | null;
    },
    transaction: Transaction,
  ): Promise<BudgetHead | null>;
}
