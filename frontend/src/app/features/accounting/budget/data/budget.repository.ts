import { Observable } from 'rxjs';
import { BudgetStatus } from '../../data/accounting.models';
import {
  BudgetHead,
  BudgetLineDetail,
  BudgetLineRow,
  BudgetOverview,
  CopyBudgetCommand,
  CopyBudgetResult,
  SaveBudgetLineCommand,
} from './budget.models';

/**
 * Port of Presupuesto (E-06): fixed and committee budgets of a sede per year, with the real
 * execution computed from the cash book. Every call needs budgets.manage and a sede scope.
 */
export abstract class BudgetRepository {
  /** `year` null: the current year. */
  abstract overview(year: number | null): Observable<BudgetOverview>;
  /** Adds or edits a line; the first line of a year and type creates its budget as a draft. */
  abstract saveLine(command: SaveBudgetLineCommand): Observable<BudgetLineRow>;
  abstract deleteLine(lineId: number): Observable<void>;
  abstract lineDetail(lineId: number): Observable<BudgetLineDetail>;
  /** Draft → approved → closed; an approved budget can go back to draft. */
  abstract changeStatus(budgetId: number, status: BudgetStatus): Observable<BudgetHead>;
  /** Expected growth of the income as a fraction; null clears it. */
  abstract setIncomeIncreaseRate(budgetId: number, rate: number | null): Observable<BudgetHead>;
  /** Starts the budget of a year from another one, as a draft. */
  abstract copy(command: CopyBudgetCommand): Observable<CopyBudgetResult>;
}
