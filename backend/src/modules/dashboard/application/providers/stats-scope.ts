import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import type { StatsScope } from '../ports/dashboard-stats.reader.js';

/** The platform scope has no denomination, which readers understand as "everything". */
export function statsScopeOf(tenant: TenantContext): StatsScope {
  return {
    denominationId: tenant.denominationId,
    congregationId: tenant.congregationId,
  };
}
