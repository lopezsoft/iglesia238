import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../core/http/api-url';
import { DashboardPeriod, DashboardSummary } from './dashboard.models';
import { DashboardRepository } from './dashboard.repository';

/** Adapter over `GET /api/dashboard/summary?period=`. The scope header is added by the interceptor. */
@Injectable()
export class HttpDashboardRepository extends DashboardRepository {
  private readonly http = inject(HttpClient);

  summary(period: DashboardPeriod): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(apiUrl('/dashboard/summary'), {
      params: new HttpParams().set('period', period),
    });
  }
}
