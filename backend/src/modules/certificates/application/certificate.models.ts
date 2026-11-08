import type { CertificateSnapshot } from './certificate-document.js';

export type CertificateStatus = 'ISSUED' | 'VOIDED';
export type CardStatus = 'VALID' | 'EXPIRED' | 'VOIDED';

export const CERTIFICATE_STATUSES: readonly CertificateStatus[] = [
  'ISSUED',
  'VOIDED',
];
export const CARD_STATUSES: readonly CardStatus[] = [
  'VALID',
  'EXPIRED',
  'VOIDED',
];

// ---- Records: what the repositories return (dates as YYYY-MM-DD, never Prisma entities) ----

export interface CertificateTypeRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly template: string | null;
  readonly validityDays: number | null;
}

export interface CertificateRecord {
  readonly id: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly typeId: number;
  readonly typeCode: string;
  readonly typeName: string;
  readonly memberId: number;
  readonly sequenceNumber: number;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly issuedByName: string | null;
  readonly snapshot: CertificateSnapshot;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
}

export interface CardRecord {
  readonly id: number;
  readonly memberId: number;
  readonly memberName: string;
  readonly congregationId: number;
  readonly congregationCode: string;
  readonly congregationName: string;
  readonly denominationName: string;
  readonly memberNumber: number;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
}

export interface CardCandidateRecord {
  readonly memberId: number;
  readonly fullName: string;
  readonly cardNumber: string;
  readonly hasExpiredCard: boolean;
}

/** A member as the document rules see it. The document is raw: masking happens in the views. */
export interface CertificateMember {
  readonly id: number;
  readonly congregationId: number;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED';
  readonly fullName: string;
  /** SC-0130, or '' when the member has no entry in the registry book. */
  readonly code: string;
  /** Number in the current registry entry of the member's congregation. */
  readonly memberNumber: number | null;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly joinedOn: string | null;
  readonly isBaptized: boolean | null;
  readonly waterBaptismOn: string | null;
}

export interface Signer {
  readonly personId: number;
  readonly name: string;
}

export interface ResolvedSigners {
  /** The pastor must be a registered person: Certificate.pastorSignerId is mandatory. */
  readonly pastor: Signer | null;
  /** The secretary signs by name even when the user has no person record. */
  readonly secretary: { personId: number | null; name: string } | null;
}

// ---- Views: what the use cases answer (the controllers add Swagger shape only) ----

export interface CertificateTypeView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly validityDays: number | null;
  readonly hasTemplate: boolean;
}

export interface CertificateTypeOptionView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  /** Number the next certificate of this series will get (informative, not reserved). */
  readonly nextNumber: string;
}

export interface IssuingContextView {
  readonly congregationId: number;
  readonly year: number;
  readonly today: string;
  readonly letterhead: {
    readonly denominationName: string;
    readonly legalName: string;
    readonly taxId: string;
    readonly congregationName: string;
    readonly cityName: string;
    readonly locationLine: string;
  };
  readonly signers: {
    readonly pastorName: string | null;
    readonly secretaryName: string | null;
  };
  readonly issuedByName: string;
  readonly types: readonly CertificateTypeOptionView[];
}

export interface MemberOptionView {
  readonly id: number;
  readonly fullName: string;
  readonly code: string;
  /** Always masked ("CC ····8916"). */
  readonly documentLabel: string;
  readonly joinedOn: string | null;
  readonly isBaptized: boolean;
  readonly waterBaptismOn: string | null;
}

export interface CertificateListItemView {
  readonly id: number;
  readonly number: string;
  readonly typeCode: string;
  readonly typeName: string;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly memberId: number;
  readonly memberName: string;
  readonly memberCode: string;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly issuedByName: string;
  readonly status: CertificateStatus;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
}

export interface CertificateDetailView extends CertificateListItemView {
  readonly snapshot: CertificateSnapshot;
}

export interface CertificatePreviewView {
  readonly snapshot: CertificateSnapshot;
  /** Reasons why issuing would fail right now (for instance, no current pastor). */
  readonly warnings: readonly string[];
}

export interface CardListItemView {
  readonly id: number;
  readonly memberId: number;
  readonly memberName: string;
  readonly cardNumber: string;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly status: CardStatus;
  readonly daysToExpire: number | null;
  readonly voidReason: string | null;
}

export interface CertificatesSummaryView {
  readonly year: number;
  readonly today: string;
  readonly issued: number;
  readonly voided: number;
  readonly cardsValid: number;
  readonly cardsExpiringSoon: number;
  readonly cardsExpired: number;
}

/** Answer of the public verification (anonymous): only what the printed document already shows, with the holder masked. */
export interface CertificateVerificationView {
  readonly status: 'VALID' | 'EXPIRED' | 'VOIDED';
  readonly number: string;
  readonly title: string;
  readonly denominationName: string;
  readonly congregationName: string;
  /** "Ana M. R. D." */
  readonly holderName: string;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  /** Day (Bogotá) the check was made. */
  readonly verifiedOn: string;
}

export interface PdfFile {
  readonly filename: string;
  readonly content: Buffer;
}

export interface CertificateFilter {
  readonly typeCode?: string;
  readonly status?: CertificateStatus;
  readonly q?: string;
  readonly memberId?: number;
  readonly issuedFrom?: string;
  readonly issuedTo?: string;
  readonly sort: 'issuedOn:desc' | 'issuedOn:asc';
}

export interface CardFilter {
  readonly status?: CardStatus;
  readonly q?: string;
  readonly expiringInDays?: number;
  readonly today: string;
}

export interface PageParams {
  readonly page: number;
  readonly pageSize: number;
}
