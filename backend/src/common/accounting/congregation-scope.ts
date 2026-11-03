import {
  ErrorCode,
  InvalidInputException,
} from '../errors/domain.exception.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import type { TenantScope } from '../tenancy/tenant-scope.js';

/**
 * Scope of one congregation for operations that belong to a sede (periods, vouchers, cash lines).
 * A denomination-wide session must pick a sede first: the answer is 400, not a server error.
 */
export function requireCongregationScope(
  tenant: TenantContext,
  action: string,
): TenantScope {
  const scope = tenant.tenantScope();
  if (scope.congregationId === null) {
    throw new InvalidInputException(
      `Selecciona una sede para ${action}.`,
      ErrorCode.CONGREGATION_SCOPE_REQUIRED,
    );
  }
  return scope;
}
