import type { CertificateSnapshot } from '../certificate-document.js';

export const CERTIFICATE_VERIFICATION_LINKS = Symbol(
  'CERTIFICATE_VERIFICATION_LINKS',
);
export const CERTIFICATE_VERIFICATION_READER = Symbol(
  'CERTIFICATE_VERIFICATION_READER',
);

/**
 * Public verification link printed on a certificate (as a QR code). The link carries a signed token, so
 * nobody can verify (or enumerate) certificates by guessing identifiers.
 */
export interface CertificateVerificationLinks {
  /** Absolute URL of the public page that verifies the certificate. */
  linkFor(certificateId: number): string;
  /** Id of the certificate a token was issued for, or null if the token is malformed or its signature is wrong. */
  certificateIdOf(token: string): number | null;
}

/** What the public verification may know about a certificate: only what the document itself prints. */
export interface VerifiableCertificateRecord {
  readonly snapshot: CertificateSnapshot;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly voidedAt: Date | null;
}

/** Reads a certificate without a tenant scope: the signed token is the credential. */
export interface CertificateVerificationReader {
  findById(certificateId: number): Promise<VerifiableCertificateRecord | null>;
}
