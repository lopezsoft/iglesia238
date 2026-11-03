import { Observable } from 'rxjs';
import { DashboardPeriod, DashboardSummary } from './dashboard.models';

/**
 * Port to the dashboard API (GET /api/dashboard/summary). The API computes the summary for the active
 * scope (the `X-Scope` header) and only carries the widgets the permissions of that scope allow.
 */
export abstract class DashboardRepository {
  abstract summary(period: DashboardPeriod): Observable<DashboardSummary>;
}
