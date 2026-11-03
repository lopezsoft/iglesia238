import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { MemberOptionView } from '../certificate.models.js';

export const CERTIFICATE_MEMBER_SEARCH = Symbol('CERTIFICATE_MEMBER_SEARCH');

/**
 * Looks for the active members a document can be issued to. The adapter is a thin projection over
 * the shared SearchPeople use case of the membership module, which masks the document.
 */
export interface CertificateMemberSearch {
  /** Active members of the congregation in scope matching name, member code or document. */
  searchActiveMembers(
    scope: TenantScope,
    query: string,
    limit: number,
  ): Promise<MemberOptionView[]>;
}
