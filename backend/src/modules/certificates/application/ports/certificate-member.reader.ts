import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { CertificateMember } from '../certificate.models.js';

export const CERTIFICATE_MEMBER_READER = Symbol('CERTIFICATE_MEMBER_READER');

/** Read-only view of the members that documents are issued to. */
export interface CertificateMemberReader {
  /** The member inside the scope (denomination, and congregation when the scope has one). */
  findMember(
    scope: TenantScope,
    memberId: number,
  ): Promise<CertificateMember | null>;
}
