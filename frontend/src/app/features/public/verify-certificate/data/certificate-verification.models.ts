export type CertificateVerificationStatus = 'VALID' | 'EXPIRED' | 'VOIDED';

/** What the public check of a certificate answers: the printed data, with the holder masked. */
export interface CertificateVerification {
  readonly status: CertificateVerificationStatus;
  readonly number: string;
  readonly title: string;
  readonly denominationName: string;
  readonly congregationName: string;
  /** "Ana M. R. D." */
  readonly holderName: string;
  /** ISO date (YYYY-MM-DD). */
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly verifiedOn: string;
}
