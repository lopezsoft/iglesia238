import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
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
import { BudgetRepository } from './budget.repository';

const BASE = '/accounting/budgets';

/** Adapter over `/api/accounting/budgets`. The scope header is added by the interceptor. */
@Injectable()
export class HttpBudgetRepository extends BudgetRepository {
  private readonly http = inject(HttpClient);

  override overview(year: number | null): Observable<BudgetOverview> {
    const params = year === null ? new HttpParams() : new HttpParams().set('year', year);
    return this.http.get<BudgetOverview>(apiUrl(`${BASE}/overview`), { params });
  }

  override saveLine(command: SaveBudgetLineCommand): Observable<BudgetLineRow> {
    const { id, ...body } = command;
    return id === null
      ? this.http.post<BudgetLineRow>(apiUrl(`${BASE}/lines`), body)
      : this.http.put<BudgetLineRow>(apiUrl(`${BASE}/lines/${id}`), body);
  }

  override deleteLine(lineId: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`${BASE}/lines/${lineId}`));
  }

  override lineDetail(lineId: number): Observable<BudgetLineDetail> {
    return this.http.get<BudgetLineDetail>(apiUrl(`${BASE}/lines/${lineId}`));
  }

  override changeStatus(budgetId: number, status: BudgetStatus): Observable<BudgetHead> {
    return this.http.patch<BudgetHead>(apiUrl(`${BASE}/${budgetId}/status`), { status });
  }

  override setIncomeIncreaseRate(budgetId: number, rate: number | null): Observable<BudgetHead> {
    return this.http.patch<BudgetHead>(apiUrl(`${BASE}/${budgetId}`), { incomeIncreaseRate: rate });
  }

  override copy(command: CopyBudgetCommand): Observable<CopyBudgetResult> {
    return this.http.post<CopyBudgetResult>(apiUrl(`${BASE}/copy`), command);
  }
}
