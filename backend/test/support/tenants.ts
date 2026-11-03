import { TenantContext } from '../../src/common/tenancy/tenant-context.js';
import { TenantScope } from '../../src/common/tenancy/tenant-scope.js';

/** Two denominations; the first has two congregations. Used by every isolation test. */
export const TENANT_A = TenantScope.of(1, 10);
export const TENANT_A_SIBLING = TenantScope.of(1, 11);
export const TENANT_A_WIDE = TenantScope.of(1);
export const TENANT_B = TenantScope.of(2, 20);

interface ContextOptions {
  kind?: 'PLATFORM' | 'DENOMINATION' | 'CONGREGATION';
  denominationId?: number | null;
  congregationId?: number | null;
  permissions?: readonly string[];
  userId?: number;
  roleCodes?: readonly string[];
}

/** A TenantContext for tests, congregation scope of TENANT_A unless overridden. */
export function buildTenantContext(
  options: ContextOptions = {},
): TenantContext {
  const kind = options.kind ?? 'CONGREGATION';
  const denominationId =
    options.denominationId !== undefined
      ? options.denominationId
      : kind === 'PLATFORM'
        ? null
        : 1;
  const congregationId =
    options.congregationId !== undefined
      ? options.congregationId
      : kind === 'CONGREGATION'
        ? 10
        : null;

  return new TenantContext({
    userId: options.userId ?? 7,
    sessionId: 'session-1',
    scopeKey:
      kind === 'PLATFORM'
        ? 'P'
        : kind === 'DENOMINATION'
          ? `D:${denominationId}`
          : `C:${congregationId}`,
    kind,
    denominationId,
    congregationId,
    roleCodes: options.roleCodes ?? [],
    permissions: new Set(options.permissions ?? []),
  });
}
