import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { CommandContext } from '../command-context.js';

/** A command context for tests: the user acts in `scope`. */
export function commandContext(scope: TenantScope, userId = 7): CommandContext {
  return {
    scope,
    actor: {
      userId,
      denominationId: scope.denominationId,
      congregationId: scope.congregationId,
    },
    ipAddress: null,
  };
}
