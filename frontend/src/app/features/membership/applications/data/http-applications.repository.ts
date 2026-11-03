import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import {
  ApplicationDetail,
  ApplicationListQuery,
  ApplicationQueue,
  ApprovalResult,
} from './applications.models';
import { ApplicationsRepository, ApproveOptions } from './applications.repository';

const BASE = '/membership-applications';

/** Application review over the REST API. The scope header is added by the scope interceptor. */
@Injectable()
export class HttpApplicationsRepository extends ApplicationsRepository {
  private readonly http = inject(HttpClient);

  list(query: ApplicationListQuery): Observable<ApplicationQueue> {
    let params = new HttpParams()
      .set('filter', query.filter)
      .set('order', query.order)
      .set('page', query.page)
      .set('pageSize', query.pageSize);
    const search = query.search.trim();
    if (search !== '') {
      params = params.set('q', search);
    }
    if (query.congregationId !== null) {
      params = params.set('congregationId', query.congregationId);
    }
    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }
    return this.http.get<ApplicationQueue>(apiUrl(BASE), { params });
  }

  get(id: number): Observable<ApplicationDetail> {
    return this.http.get<ApplicationDetail>(apiUrl(`${BASE}/${id}`));
  }

  startReview(id: number): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(apiUrl(`${BASE}/${id}/start-review`), {});
  }

  reject(id: number, reason: string): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(apiUrl(`${BASE}/${id}/reject`), { reason });
  }

  markDuplicate(id: number, matchedPersonId: number): Observable<ApplicationDetail> {
    return this.http.post<ApplicationDetail>(apiUrl(`${BASE}/${id}/mark-duplicate`), { matchedPersonId });
  }

  approve(id: number, options: ApproveOptions = {}): Observable<ApprovalResult> {
    return this.http.post<ApprovalResult>(apiUrl(`${BASE}/${id}/approve`), {
      ...(options.linkToPersonId !== undefined ? { linkToPersonId: options.linkToPersonId } : {}),
    });
  }
}
