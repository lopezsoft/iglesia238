import type { CertificateSnapshot } from '../certificate-document.js';

export const DOCUMENT_PDF_RENDERER = Symbol('DOCUMENT_PDF_RENDERER');

export interface CertificatePdfInput {
  readonly snapshot: CertificateSnapshot;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly voided: boolean;
  /** Public verification link, drawn as a QR code. Without it the certificate prints the number only. */
  readonly verificationUrl?: string;
  /** Logo of the denomination (PNG or JPEG bytes), drawn in the letterhead. */
  readonly logo?: Buffer;
  /** Color of the denomination (#RRGGBB) for the frame, titles and tables; the default blue when missing. */
  readonly accentColor?: string;
}

export interface CardPdfInput {
  readonly denominationName: string;
  readonly congregationName: string;
  readonly memberName: string;
  readonly cardNumber: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly status: 'VALID' | 'EXPIRED' | 'VOIDED';
  readonly logo?: Buffer;
  readonly accentColor?: string;
}

/** Renders the printable documents. The adapter decides the library; the use cases only hand it data. */
export interface DocumentPdfRenderer {
  certificate(input: CertificatePdfInput): Promise<Buffer>;
  card(input: CardPdfInput): Promise<Buffer>;
}
