import { Observable } from 'rxjs';
import { BudgetLineRow, BudgetOverview, SaveBudgetLineCommand } from './budget.models';

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
}
