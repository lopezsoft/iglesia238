// Review of membership applications (C-03/C-04), mirroring GET /api/membership-applications.
import { ApplicationStatus, MemberStatus, Sex } from '../../../../core/models/membership.model';
import { BadgeTone } from '../../../../shared/ui/status-badge.component';

/** Status chips of the queue: "Pendientes" groups PENDING and IN_REVIEW. */
export type ApplicationFilter = 'PENDING' | 'DUPLICATE' | 'APPROVED' | 'REJECTED' | 'ALL';

export const APPLICATION_FILTERS: readonly ApplicationFilter[] = [
  'PENDING',
  'DUPLICATE',
  'APPROVED',
  'REJECTED',
  'ALL',
];

export const APPLICATION_FILTER_LABELS: Readonly<Record<ApplicationFilter, string>> = {
  PENDING: 'Pendientes',
  DUPLICATE: 'Duplicadas',
  APPROVED: 'Aprobadas',
  REJECTED: 'Rechazadas',
  ALL: 'Todas',
};

export const APPLICATION_FILTER_TITLES: Readonly<Record<ApplicationFilter, string>> = {
  PENDING: 'solicitudes pendientes',
  DUPLICATE: 'solicitudes duplicadas',
  APPROVED: 'solicitudes aprobadas',
  REJECTED: 'solicitudes rechazadas',
  ALL: 'solicitudes',
};

export const APPLICATION_STATUS_TONES: Readonly<Record<ApplicationStatus, BadgeTone>> = {
  PENDING: 'warning',
  IN_REVIEW: 'info',
  DUPLICATE: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
};

export const SEX_LABELS: Readonly<Record<Sex, string>> = {
  FEMALE: 'Femenino',
  MALE: 'Masculino',
};

/** Only these statuses can still be approved, rejected or marked as duplicate. */
export const REVIEWABLE_STATUSES: readonly ApplicationStatus[] = ['PENDING', 'IN_REVIEW'];

/** rejection_reason is VARCHAR(255) in the API. */
export const REJECTION_REASON_MAX_LENGTH = 255;
/** The reason is read by the next reviewer and the audit, so it has to say something. */
export const REJECTION_REASON_MIN_LENGTH = 10;
export const ADULT_AGE = 18;
export const APPLICATIONS_PAGE_SIZE = 10;

export function isReviewable(status: ApplicationStatus): boolean {
  return REVIEWABLE_STATUSES.includes(status);
}

export function parseApplicationFilter(value: string | null | undefined): ApplicationFilter {
  const upper = (value ?? '').toUpperCase();
  return APPLICATION_FILTERS.find((filter) => filter === upper) ?? 'PENDING';
}

/** "CC 1023456789", or a dash when the applicant gave no document. */
export function documentLabel(typeCode: string | null, number: string | null): string {
  return number ? [typeCode, number].filter(Boolean).join(' ') : '—';
}

/** What the reviewer filters the queue with (query string of GET /membership-applications). */
export interface ApplicationListQuery {
  readonly filter: ApplicationFilter;
  /** Words of the name or the document. */
  readonly search: string;
  /** Only with a denomination-wide scope. */
  readonly congregationId: number | null;
  /** First day received (yyyy-MM-dd), inclusive. */
  readonly from: string | null;
  /** Last day received (yyyy-MM-dd), inclusive. */
  readonly to: string | null;
  readonly order: 'asc' | 'desc';
  readonly page: number;
  readonly pageSize: number;
}

export const DEFAULT_LIST_QUERY: ApplicationListQuery = {
  filter: 'PENDING',
  search: '',
  congregationId: null,
  from: null,
  to: null,
  order: 'desc',
  page: 1,
  pageSize: APPLICATIONS_PAGE_SIZE,
};

/** Row of the review queue. */
export interface ApplicationSummary {
  readonly id: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly status: ApplicationStatus;
  readonly fullName: string;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly createdAt: string;
  readonly isMinor: boolean;
  /** A person with the same document already exists in the denomination (reviewable only). */
  readonly hasDuplicateMatch: boolean;
}

export type ApplicationCounts = Readonly<Record<ApplicationFilter, number>>;

export interface ApplicationQueue {
  readonly items: readonly ApplicationSummary[];
  /** Rows matching every filter, across pages. */
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Per chip, ignoring the chip, the search and the dates. */
  readonly counts: ApplicationCounts;
}

/** Existing person of the denomination with the same document as an application. */
export interface PersonMatch {
  readonly personId: number;
  readonly fullName: string;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  /** Current sede of the person when they are a member. */
  readonly congregationName: string | null;
  readonly memberId: number | null;
  readonly memberCode: string | null;
  readonly memberStatus: MemberStatus | null;
}

/** Answers of the public form that have no column of their own. */
export interface ApplicationFormData {
  readonly secondLastName: string | null;
  readonly sex: Sex;
  readonly maritalStatusCode: string;
  readonly maritalStatusName: string | null;
  readonly address: string;
  readonly municipalityCode: string;
  readonly municipalityName: string | null;
  readonly regionName: string | null;
  readonly neighborhood: string | null;
  readonly occupation: string | null;
  readonly previousCongregationName: string | null;
  readonly isBaptized: boolean | null;
  readonly guardianRelationship: string | null;
  readonly guardianPhone: string | null;
  readonly guardianDocumentTypeCode: string | null;
}

export interface ApplicationDetail {
  readonly id: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly status: ApplicationStatus;
  readonly documentTypeCode: string | null;
  readonly documentTypeName: string | null;
  readonly documentNumber: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly birthDate: string | null;
  readonly age: number | null;
  readonly isMinor: boolean;
  readonly guardianName: string | null;
  readonly guardianDocument: string | null;
  readonly formData: ApplicationFormData;
  readonly policyVersion: string | null;
  readonly consentedAt: string;
  readonly createdAt: string;
  readonly reviewerName: string | null;
  readonly reviewedAt: string | null;
  /** Internal reason of a rejection: the applicant never sees it. */
  readonly rejectionReason: string | null;
  /** Possible duplicate, computed only while the application can still be resolved. */
  readonly duplicateMatch: PersonMatch | null;
  /** Person the application was linked to when it was marked as duplicate. */
  readonly linkedPerson: PersonMatch | null;
  readonly memberId: number | null;
  readonly memberCode: string | null;
}

export interface ApprovalResult {
  readonly applicationId: number;
  readonly memberId: number;
  readonly memberNumber: number;
  /** Card code of the new member in its sede, e.g. SC-0153. */
  readonly memberCode: string;
}

/** A person can join again unless they are an active member or deceased. */
export function canLinkMatch(match: PersonMatch): boolean {
  return match.memberStatus !== 'ACTIVE' && match.memberStatus !== 'DECEASED';
}
