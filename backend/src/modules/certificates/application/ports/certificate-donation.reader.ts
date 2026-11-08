import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';

export const CERTIFICATE_DONATION_READER = Symbol(
  'CERTIFICATE_DONATION_READER',
);

/** The recorded contributions of one contribution type, added up. Amounts in cents. */
export interface DonationLineRecord {
  readonly concept: string;
  readonly receipts: number;
  readonly amountCents: number;
}

/** Reads what a member gave, for the donations certificate. */
export interface CertificateDonationReader {
  /**
   * Contributions of the member that are still in force (not voided) received between the two ISO dates
   * (both included), grouped by contribution type. Only the sedes that share the legal entity of the
   * congregation of the scope count: that is the taxpayer who signs the certificate. Empty when there are none.
   */
  summarize(
    scope: TenantScope,
    memberId: number,
    range: { readonly from: string; readonly to: string },
  ): Promise<readonly DonationLineRecord[]>;
}
