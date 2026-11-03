import type { CertificateSnapshot } from '../certificate-document.js';

export const DOCUMENT_PDF_RENDERER = Symbol('DOCUMENT_PDF_RENDERER');

export interface CertificatePdfInput {
  readonly snapshot: CertificateSnapshot;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly voided: boolean;
}

export interface CardPdfInput {
  readonly denominationName: string;
  readonly congregationName: string;
  readonly memberName: string;
  readonly cardNumber: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly status: 'VALID' | 'EXPIRED' | 'VOIDED';
}

/** Renders the printable documents. The adapter decides the library; the use cases only hand it data. */
export interface DocumentPdfRenderer {
  certificate(input: CertificatePdfInput): Promise<Buffer>;
  card(input: CardPdfInput): Promise<Buffer>;
}
