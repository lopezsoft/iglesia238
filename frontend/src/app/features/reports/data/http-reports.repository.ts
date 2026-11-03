import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../core/http/api-url';
import { FinancialReport, ReportOptions, ReportQuery } from './reports.models';
import { ReportsRepository } from './reports.repository';

function paramsOf(query: ReportQuery): HttpParams {
  let params = new HttpParams().set('from', query.from).set('to', query.to);
  if (query.fundId !== null) {
    params = params.set('fundId', query.fundId);
  }
  if (query.congregationId !== null) {
    params = params.set('congregationId', query.congregationId);
  }
  return params;
}

/** Adapter over `/api/reports`. The scope header is added by the interceptor. */
@Injectable()
export class HttpReportsRepository extends ReportsRepository {
  private readonly http = inject(HttpClient);

  override options(): Observable<ReportOptions> {
    return this.http.get<ReportOptions>(apiUrl('/reports/options'));
  }

  override financialReport(query: ReportQuery): Observable<FinancialReport> {
    return this.http.get<FinancialReport>(apiUrl('/reports/financial'), { params: paramsOf(query) });
  }

  override contributionDetailCsv(query: ReportQuery): Observable<Blob> {
    // A refused export (422 EXPORT_TOO_LARGE) keeps its code and message: the interceptor decodes the Blob.
    return this.http.get(apiUrl('/reports/contributions-detail.csv'), {
      params: paramsOf(query),
      responseType: 'blob',
      headers: { Accept: 'text/csv' },
    });
  }
}
