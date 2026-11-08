// Who may use the certificates module, and for which types. Pure: it only reads the permissions of the tenant.

import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { DONATION_TYPE_CODE } from './certificate-document.js';
import type { CertificateFilter } from './certificate.models.js';

/**
 * Lets the treasury issue and manage the donations certificate, and nothing else of the module. It is a
 * permission of its own so that granting it does not open the membership, baptism or transfer certificates.
 */
export const DONATION_ISSUE_PERMISSION = 'donation-certificates.issue';

/** Holds the donations permission but not the general one: the module shows it the donations certificate only. */
export function donationsOnly(tenant: TenantContext): boolean {
  return (
    !tenant.has('certificates.issue') && tenant.has(DONATION_ISSUE_PERMISSION)
  );
}

/**
 * The donations certificate shows amounts: it needs the explicit permission, or the general one together
 * with the permission to read the contributions (the pastor).
 */
export function canIssueDonations(tenant: TenantContext): boolean {
  return (
    tenant.has(DONATION_ISSUE_PERMISSION) ||
    (tenant.has('certificates.issue') && tenant.has('contributions.read'))
  );
}

/** A type the tenant may see: all of them, except for the user who only handles donations. */
export function canSeeType(tenant: TenantContext, typeCode: string): boolean {
  return !donationsOnly(tenant) || typeCode === DONATION_TYPE_CODE;
}

/** The filter of a list or an export, narrowed to the donations certificate for the user who only handles it. */
export function restrictedFilter(
  tenant: TenantContext,
  filter: CertificateFilter,
): CertificateFilter {
  return donationsOnly(tenant)
    ? { ...filter, typeCode: DONATION_TYPE_CODE }
    : filter;
}
