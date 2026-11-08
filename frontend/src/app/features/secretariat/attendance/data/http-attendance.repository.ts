import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { apiUrl } from '../../../../core/http/api-url';
import { DomainError } from '../../../../core/errors/domain-error';
import { Page } from '../../../../shared/utils/pagination';
import { queryParams } from '../../shared/query-params';
import {
  AttendanceCount,
  AttendanceFilter,
  AttendanceListQuery,
  AttendanceOptions,
  AttendanceSession,
  AttendanceSessionInput,
  AttendanceSessionKey,
  AttendanceStats,
  AttendanceStatsQuery,
} from './attendance.models';
import { AttendanceRepository } from './attendance.repository';

function filterParams(filter: AttendanceFilter) {
  return {
    congregationId: filter.congregationId,
    meetingTypeCode: filter.meetingTypeCode,
    from: filter.from,
    to: filter.to,
  };
}

/** Adapter over `/api/attendance-sessions`. */
@Injectable()
export class HttpAttendanceRepository extends AttendanceRepository {
  private readonly http = inject(HttpClient);

  override options(): Observable<AttendanceOptions> {
    return this.http.get<AttendanceOptions>(apiUrl('/attendance-sessions/options'));
  }

  override list(query: AttendanceListQuery): Observable<Page<AttendanceSession>> {
    return this.http.get<Page<AttendanceSession>>(apiUrl('/attendance-sessions'), {
      params: queryParams({ ...filterParams(query), page: query.page, pageSize: query.pageSize }),
    });
  }

  override find(key: AttendanceSessionKey): Observable<AttendanceSession | null> {
    return this.http
      .get<AttendanceSession>(apiUrl('/attendance-sessions/lookup'), {
        params: queryParams({ ...key }),
      })
      .pipe(
        catchError((error: unknown) =>
          error instanceof DomainError && error.code === 'SESSION_NOT_FOUND'
            ? of(null)
            : throwError(() => error),
        ),
      );
  }

  override create(input: AttendanceSessionInput): Observable<AttendanceSession> {
    return this.http.post<AttendanceSession>(apiUrl('/attendance-sessions'), input);
  }

  override update(id: number, counts: readonly AttendanceCount[]): Observable<AttendanceSession> {
    return this.http.put<AttendanceSession>(apiUrl(`/attendance-sessions/${id}`), {
      attendanceCounts: counts,
    });
  }

  override remove(id: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`/attendance-sessions/${id}`)).pipe(map(() => undefined));
  }

  override stats(query: AttendanceStatsQuery): Observable<AttendanceStats> {
    return this.http.get<AttendanceStats>(apiUrl('/attendance-sessions/stats'), {
      params: queryParams({ ...filterParams(query), groupBy: query.groupBy }),
    });
  }

  override exportPdf(filter: AttendanceFilter): Observable<Blob> {
    return this.http.get(apiUrl('/attendance-sessions/report.pdf'), {
      params: queryParams(filterParams(filter)),
      headers: { Accept: 'application/pdf' },
      responseType: 'blob',
    });
  }

  override exportCsv(filter: AttendanceFilter): Observable<Blob> {
    return this.http.get(apiUrl('/attendance-sessions/export'), {
      params: queryParams(filterParams(filter)),
      responseType: 'blob',
    });
  }
}
