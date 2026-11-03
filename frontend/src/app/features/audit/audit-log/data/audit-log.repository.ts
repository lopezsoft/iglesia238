import { Observable } from 'rxjs';
import { AuditFilterOptions, AuditPage, AuditQuery } from './audit-log.models';

/**
 * Port to the read-only audit API. A platform admin sees every entry; a denomination admin
 * only those of their denomination. Entries are newest first and IP addresses come masked.
 */
export abstract class AuditLogRepository {
  /** Fails with 'INVALID_RANGE' or 'RANGE_TOO_LONG' for a wrong date range. */
  abstract list(query: AuditQuery): Observable<AuditPage>;

  abstract filterOptions(): Observable<AuditFilterOptions>;
}
