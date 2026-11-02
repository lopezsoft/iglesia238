import { Observable } from 'rxjs';
import { DashboardSummary } from './dashboard.models';

/**
 * Port to the dashboard API (GET /dashboard). The summary is computed for the active scope and
 * only carries the widgets the permissions of that scope allow; the rest come as null.
 */
export abstract class DashboardRepository {
  abstract summary(): Observable<DashboardSummary>;
}
