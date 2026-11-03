import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { Page } from '../../../../shared/utils/pagination';
import {
  SettlementQuery,
  TitheOverview,
  TithePreview,
  TitheRange,
  TitheSettlementDetail,
  TitheSettlementRow,
} from './tithe-settlements.models';
import { TitheSettlementsRepository } from './tithe-settlements.repository';

const BASE = '/accounting/tithe-settlements';

/** Adapter over `/api/accounting/tithe-settlements`. The scope header is added by the interceptor. */
@Injectable()
export class HttpTitheSettlementsRepository extends TitheSettlementsRepository {
  private readonly http = inject(HttpClient);

  override overview(): Observable<TitheOverview> {
    return this.http.get<TitheOverview>(apiUrl(`${BASE}/overview`));
  }

  override preview(range: TitheRange): Observable<TithePreview> {
    return this.http.get<TithePreview>(apiUrl(`${BASE}/preview`), {
      params: new HttpParams().set('from', range.from).set('to', range.to),
    });
  }

  override confirm(range: TitheRange): Observable<TitheSettlementRow> {
    // The server recomputes the draft: only the range travels.
    return this.http.post<TitheSettlementRow>(apiUrl(BASE), { from: range.from, to: range.to });
  }

  override void(settlementId: number, reason: string): Observable<TitheSettlementRow> {
    return this.http.post<TitheSettlementRow>(apiUrl(`${BASE}/${settlementId}/void`), { reason });
  }

  override list(query: SettlementQuery): Observable<Page<TitheSettlementRow>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }
    return this.http.get<Page<TitheSettlementRow>>(apiUrl(BASE), { params });
  }

  override detail(settlementId: number): Observable<TitheSettlementDetail> {
    return this.http.get<TitheSettlementDetail>(apiUrl(`${BASE}/${settlementId}`));
  }
}
