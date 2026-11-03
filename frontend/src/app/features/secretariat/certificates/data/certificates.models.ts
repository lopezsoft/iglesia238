// Certificates and membership cards: the shapes of the API (backend/src/modules/certificates).
// Dates are YYYY-MM-DD strings and instants are ISO 8601; "today" always comes from the server.
import { Page, PageRequest } from '../../../../shared/utils/pagination';

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

// ---- Views and commands of the port (what the API sends and receives) ----

/** Sede, signers and series of the active sede: everything the issue form needs. */
export interface IssuingContext {
  readonly congregationId: number;
  readonly year: number;
  /** Today in Bogota, according to the server. */
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

/** Catalog entry of the denomination, available also without a sede (for the list filter). */
export interface CertificateTypeSummary {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly validityDays: number | null;
  readonly hasTemplate: boolean;
}

/** Active member of the sede, as the issue forms show it. The document is masked by the server. */
export interface MemberOption {
  readonly id: number;
  readonly fullName: string;
  readonly code: string;
  readonly documentLabel: string;
  readonly joinedOn: string | null;
  readonly isBaptized: boolean;
  readonly waterBaptismOn: string | null;
}

export type CertificateSort = 'issuedOn:desc' | 'issuedOn:asc';

export interface CertificateFilter extends PageRequest {
  readonly typeCode: string | null;
  readonly status: CertificateStatus | null;
  /** Document number (CERT-MEM-2026-0031) or member name. */
  readonly q: string | null;
  readonly issuedFrom: string | null;
  readonly issuedTo: string | null;
  readonly sort: CertificateSort;
}

/** Filters of the export: the same as the list, without the page. */
export type CertificateExportFilter = Omit<CertificateFilter, keyof PageRequest>;

export interface CertificateListItem {
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

export interface CertificateDetail extends CertificateListItem {
  readonly snapshot: CertificateSnapshot;
}

export interface CertificatePreview {
  readonly snapshot: CertificateSnapshot;
  /** Reasons why issuing would fail right now (for instance, no current pastor). */
  readonly warnings: readonly string[];
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

export interface CardFilter extends PageRequest {
  readonly status: CardStatus | null;
  /** Member name or card number (SC-0130). */
  readonly q: string | null;
  /** Only valid cards that expire within these days. */
  readonly expiringInDays: number | null;
}

export interface CardListItem {
  readonly id: number;
  readonly memberId: number;
  readonly memberName: string;
  /** Sede code and member number, e.g. SC-0130. */
  readonly cardNumber: string;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly issuedOn: string;
  readonly expiresOn: string;
  readonly status: CardStatus;
  /** Days until it expires, for valid cards. */
  readonly daysToExpire: number | null;
  readonly voidReason: string | null;
}

/** Active member of the sede who can receive a card (registered, no valid card). */
export interface CardCandidate {
  readonly memberId: number;
  readonly fullName: string;
  readonly cardNumber: string;
  readonly hasExpiredCard: boolean;
}

export interface CardCandidateQuery extends PageRequest {
  readonly q: string | null;
}

export interface IssueCardCommand {
  readonly memberId: number;
  readonly issuedOn: string;
  readonly expiresOn: string;
}

export interface CertificatesSummary {
  readonly year: number;
  /** Today in Bogota, according to the server (the card form needs it without a sede). */
  readonly today: string;
  readonly issued: number;
  readonly voided: number;
  readonly cardsValid: number;
  readonly cardsExpiringSoon: number;
  readonly cardsExpired: number;
}

export type CertificatePage = Page<CertificateListItem>;
export type CardPage = Page<CardListItem>;
export type CardCandidatePage = Page<CardCandidate>;

export const CERTIFICATE_STATUS_LABELS: Readonly<Record<CertificateStatus, string>> = {
  ISSUED: 'Vigente',
  VOIDED: 'Anulado',
};

export const CARD_STATUS_LABELS: Readonly<Record<CardStatus, string>> = {
  VALID: 'Vigente',
  EXPIRED: 'Vencido',
  VOIDED: 'Anulado',
};

/** Card validity the form suggests; the server accepts any expiry after the issue date. */
export const DEFAULT_CARD_VALIDITY_YEARS = 2;
/** A valid card that expires within these days is flagged in the list (the server counts the same). */
export const CARD_EXPIRY_WARNING_DAYS = 30;
export const VOID_REASON_MIN_LENGTH = 10;
export const VOID_REASON_MAX_LENGTH = 255;
export const NOTES_MAX_LENGTH = 255;
