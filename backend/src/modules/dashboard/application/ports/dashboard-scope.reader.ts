import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import type { DashboardScopeInfo } from '../dashboard.types.js';

export const DASHBOARD_SCOPE_READER = Symbol('DASHBOARD_SCOPE_READER');

/** Names the scope of the request for the page header (never trusted from the client). */
export interface DashboardScopeReader {
  describe(tenant: TenantContext): Promise<DashboardScopeInfo>;
}
