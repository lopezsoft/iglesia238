import { AuthService } from '../../../core/auth/auth.service';
import { Permission } from '../../../core/auth/permission';
import { DomainError } from '../../../core/errors/domain-error';

/**
 * Tenant checks shared by the accounting demo adapters, the frontend counterpart of the API
 * TenantContext guard. Reads are allowed denomination-wide (congregationId null: aggregated per
 * sede); every write needs a concrete sede because periods, vouchers and cash lines belong to one.
 */
export interface AccountingTenant {
  readonly denominationId: number;
  /** Null when acting on "Toda la denominación". */
  readonly congregationId: number | null;
  readonly userId: number;
}

export function readTenant(auth: AuthService): AccountingTenant {
  const { denominationId, congregationId } = auth.tenant();
  const user = auth.user();
  if (denominationId === null || !user) {
    throw new DomainError('NO_TENANT', 'Selecciona una denominación o una sede para continuar.');
  }
  return { denominationId, congregationId, userId: user.id };
}

/** Tenant of a write: the permission is required and the scope must be a sede. */
export function writeTenant(
  auth: AuthService,
  permission: Permission,
  action: string,
): AccountingTenant & { readonly congregationId: number } {
  const tenant = requirePermission(auth, permission, action);
  if (tenant.congregationId === null) {
    throw new DomainError('CONGREGATION_REQUIRED', `Selecciona una sede para ${action}.`);
  }
  return { ...tenant, congregationId: tenant.congregationId };
}

/** Tenant of a denomination-level write (funds, chart of accounts, contribution types). */
export function requirePermission(auth: AuthService, permission: Permission, action: string): AccountingTenant {
  const tenant = readTenant(auth);
  if (!auth.can(permission)) {
    throw new DomainError('FORBIDDEN', `No tienes permiso para ${action}.`);
  }
  return tenant;
}

/** True when a row of `congregationId` is visible in the tenant scope. */
export function inScope(tenant: AccountingTenant, row: { denominationId: number; congregationId: number }): boolean {
  return (
    row.denominationId === tenant.denominationId &&
    (tenant.congregationId === null || row.congregationId === tenant.congregationId)
  );
}
