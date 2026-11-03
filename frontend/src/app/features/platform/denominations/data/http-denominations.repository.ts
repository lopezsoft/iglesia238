import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { Page } from '../../../../shared/utils/pagination';
import {
  DenominationInput,
  DenominationQuery,
  DenominationStats,
  DenominationSummary,
} from './denominations.models';
import { DenominationsRepository } from './denominations.repository';

const BASE = '/platform/denominations';

/** Adapter over `/api/platform/denominations`. The server paginates, filters and keeps the rules. */
@Injectable()
export class HttpDenominationsRepository extends DenominationsRepository {
  private readonly http = inject(HttpClient);

  override list(query: DenominationQuery): Observable<Page<DenominationSummary>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    const search = query.search.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (query.status !== 'all') {
      params = params.set('status', query.status);
    }
    return this.http.get<Page<DenominationSummary>>(apiUrl(BASE), { params });
  }

  override stats(): Observable<DenominationStats> {
    return this.http.get<DenominationStats>(apiUrl(`${BASE}/stats`));
  }

  override create(input: DenominationInput): Observable<DenominationSummary> {
    return this.http.post<DenominationSummary>(apiUrl(BASE), input);
  }

  override rename(id: number, input: DenominationInput): Observable<DenominationSummary> {
    return this.http.patch<DenominationSummary>(apiUrl(`${BASE}/${id}`), input);
  }

  override setActive(id: number, isActive: boolean): Observable<DenominationSummary> {
    return this.http.patch<DenominationSummary>(apiUrl(`${BASE}/${id}/status`), { isActive });
  }
}
