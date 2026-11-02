// Certificates and membership cards, mirroring CertificateType, DocumentSequence, Certificate and
// MembershipCard of backend/prisma/schema/secretariat.prisma (only the fields the UI needs).
// Fields marked "view" are computed by the data source for the screen; they are not columns.
import { Page, PageRequest } from '../../../../shared/utils/pagination';

/** Codes seeded for every denomination. The catalog is data: a denomination may add more. */
export type CertificateTypeCode = 'MEM' | 'TRA' | 'BAU' | 'ASI';

export interface CertificateType {
  readonly id: number;
  readonly denominationId: number;
  readonly code: string;
  readonly name: string;
  readonly template: string | null;
  readonly validityDays: number | null;
}

/** Gap-free counter of a sede. The key of a certificate series is CERT-<CODE>-<YEAR>. */
export interface DocumentSequence {
  readonly denominationId: number;
  readonly congregationId: number;
  readonly key: string;
  readonly lastValue: number;
}

/** What was printed. The issued document never changes when the member data changes. */
export interface CertificateSnapshot {
  readonly number: string;
  readonly typeCode: string;
  readonly title: string;
  readonly denominationName: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly congregationName: string;
  readonly locationLine: string;
  readonly intro: string;
  readonly body: string;
  readonly notes: string | null;
  readonly closing: string;
  readonly pastorName: string;
  readonly pastorTitle: string;
  readonly secretaryName: string | null;
  readonly secretaryTitle: string;
  readonly issuedByName: string;
  readonly memberName: string;
  readonly memberCode: string;
}

export type CertificateStatus = 'ISSUED' | 'VOIDED';

export interface Certificate {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly certificateTypeId: number;
  readonly memberId: number;
  readonly sequenceNumber: number;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly notes: string | null;
  /** Null only in the demo, for a pastor who is a user but not a registered person. */
  readonly pastorSignerId: number | null;
  readonly secretarySignerId: number | null;
  readonly snapshot: CertificateSnapshot;
  readonly voidedAt: string | null;
  readonly createdAt: string;
  /** Not in the Prisma model yet (the API keeps it in the audit log): who issued it. */
  readonly issuedById: number;
  /** Not in the Prisma model yet (the API keeps it in the audit log): why it was voided. */
  readonly voidReason: string | null;
}

export interface MembershipCard {
  readonly id: number;
  readonly denominationId: number;
  readonly memberId: number;
  readonly issuedOn: string;
  readonly expiresOn: string;
  /** Not in the Prisma model yet: sede and member number printed on the card. */
  readonly congregationId: number;
  readonly memberNumber: number;
  /** Not in the Prisma model yet: a voided card allows issuing a new one before it expires. */
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
}

// ---- Views and commands of the port ----

/** Sede, signers and series of the active scope: everything the issue form and preview need. */
export interface IssuingContext {
  readonly congregationId: number;
  readonly year: number;
  readonly today: string;
  readonly letterhead: Letterhead;
  readonly signers: Signers;
  readonly issuedByName: string;
  readonly types: readonly CertificateTypeOption[];
}

export interface Letterhead {
  readonly denominationName: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly congregationName: string;
  readonly cityName: string;
  readonly locationLine: string;
}

export interface Signers {
  readonly pastorName: string | null;
  readonly secretaryName: string | null;
}

export interface CertificateTypeOption {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  /** Number the next certificate of this series will get (informative, not reserved). */
  readonly nextNumber: string;
}

/** Active member of the sede, as the issue forms show it. */
export interface MemberOption {
  readonly id: number;
  readonly fullName: string;
  readonly code: string;
  readonly documentLabel: string;
  readonly joinedOn: string | null;
  readonly isBaptized: boolean;
  readonly waterBaptismOn: string | null;
}

export interface CertificateFilter extends PageRequest {
  readonly typeCode: string | null;
  readonly status: CertificateStatus | null;
}

export interface CertificateListItem {
  readonly id: number;
  readonly number: string;
  readonly typeCode: string;
  readonly typeName: string;
  readonly memberId: number;
  readonly memberName: string;
  readonly memberCode: string;
  readonly issuedOn: string;
  readonly issuedByName: string;
  readonly status: CertificateStatus;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
}

export interface CertificateDetail extends CertificateListItem {
  readonly snapshot: CertificateSnapshot;
}

export interface IssueCertificateCommand {
  readonly memberId: number;
  readonly certificateTypeId: number;
  readonly notes: string | null;
}

export interface VoidCommand {
  readonly id: number;
  readonly reason: string;
}

export type CardStatus = 'VALID' | 'EXPIRED' | 'VOIDED';
export type CardFilter = CardStatus | null;

export interface CardListItem {
  readonly id: number;
  readonly memberId: number;
  readonly memberName: string;
  /** Sede initials and member number, e.g. SC-0130. */
  readonly cardNumber: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly status: CardStatus;
  /** Days until it expires, for valid cards. */
  readonly daysToExpire: number | null;
  readonly voidReason: string | null;
}

/** Active member of the sede who can receive a card (no valid card). */
export interface CardCandidate {
  readonly memberId: number;
  readonly fullName: string;
  readonly cardNumber: string;
  readonly hasExpiredCard: boolean;
}

export interface IssueCardCommand {
  readonly memberId: number;
  readonly issuedOn: string;
  readonly expiresOn: string;
}

export interface CertificatesSummary {
  readonly year: number;
  readonly issued: number;
  readonly voided: number;
  readonly cardsValid: number;
  readonly cardsExpiringSoon: number;
  readonly cardsExpired: number;
}

export type CertificatePage = Page<CertificateListItem>;
export type CardPage = Page<CardListItem>;

export const CERTIFICATE_STATUS_LABELS: Readonly<Record<CertificateStatus, string>> = {
  ISSUED: 'Vigente',
  VOIDED: 'Anulado',
};

export const CARD_STATUS_LABELS: Readonly<Record<CardStatus, string>> = {
  VALID: 'Vigente',
  EXPIRED: 'Vencido',
  VOIDED: 'Anulado',
};

/** Card validity when the form does not change it. */
export const DEFAULT_CARD_VALIDITY_YEARS = 2;
/** A valid card that expires within these days is flagged in the list. */
export const CARD_EXPIRY_WARNING_DAYS = 30;
export const VOID_REASON_MIN_LENGTH = 10;
export const NOTES_MAX_LENGTH = 255;
