import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { AuditFilterOptions, AuditPage, AuditQuery } from './audit-log.models';
import { AuditLogRepository } from './audit-log.repository';

/**
 * Adapter over `/api/audit-logs`. The API scopes the entries to the session, checks the date
 * range, masks the IP addresses and formats the changes, so the screen shows them as they come.
 */
@Injectable()
export class HttpAuditLogRepository extends AuditLogRepository {
  private readonly http = inject(HttpClient);

  override list(query: AuditQuery): Observable<AuditPage> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    const optional: Readonly<Record<string, string | number | null>> = {
      from: query.from,
      to: query.to,
      userId: query.userId,
      action: query.action,
      entity: query.entity,
    };
    for (const [key, value] of Object.entries(optional)) {
      if (value !== null && value !== '') {
        params = params.set(key, value);
      }
    }
    return this.http.get<AuditPage>(apiUrl('/audit-logs'), { params });
  }

  override filterOptions(): Observable<AuditFilterOptions> {
    return this.http.get<AuditFilterOptions>(apiUrl('/audit-logs/filter-options'));
  }
}
