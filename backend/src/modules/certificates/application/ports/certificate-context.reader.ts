import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { Letterhead } from '../certificate-document.js';
import type { ResolvedSigners } from '../certificate.models.js';

export const CERTIFICATE_CONTEXT_READER = Symbol('CERTIFICATE_CONTEXT_READER');

/** What the printed documents need besides the member: letterhead, signers and the issuer. */
export interface CertificateContextReader {
  /** Letterhead of the congregation of the scope; null when it does not exist in the denomination. */
  findLetterhead(scope: TenantScope): Promise<Letterhead | null>;
  /**
   * Pastor: the person of the open pastoral term, or the holder of the PASTOR role. Secretary: the
   * issuer when holding the SECRETARY role of the sede, otherwise its first holder.
   */
  findSigners(
    scope: TenantScope,
    issuerUserId: number,
    today: string,
  ): Promise<ResolvedSigners>;
  /** Display name of the user who issues the document. */
  findUserName(userId: number): Promise<string | null>;
}
