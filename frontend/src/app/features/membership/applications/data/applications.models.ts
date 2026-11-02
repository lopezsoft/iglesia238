// Review of membership applications (C-03/C-04), mirroring MembershipApplication in
// backend/prisma/schema/membership.prisma plus the read-model fields the review screen needs.
import {
  ApplicationFormData,
  ApplicationStatus,
  MemberStatus,
  Sex,
} from '../../../../core/models/membership.model';
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

export const APPLICATION_FILTER_STATUSES: Readonly<
  Record<ApplicationFilter, readonly ApplicationStatus[]>
> = {
  PENDING: ['PENDING', 'IN_REVIEW'],
  DUPLICATE: ['DUPLICATE'],
  APPROVED: ['APPROVED'],
  REJECTED: ['REJECTED'],
  ALL: ['PENDING', 'IN_REVIEW', 'DUPLICATE', 'APPROVED', 'REJECTED'],
};

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
/** UX rule of the review screen: the applicant reads the reason, so it must say something. */
export const REJECTION_REASON_MIN_LENGTH = 10;
export const ADULT_AGE = 18;

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

/** Local calendar date (YYYY-MM-DD), the format of the API date columns. */
export function todayIsoDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

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
  /** Most recent first. */
  readonly items: readonly ApplicationSummary[];
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

export interface ApplicationDetail {
  readonly id: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly status: ApplicationStatus;
  readonly trackingCode: string;
  readonly documentTypeCode: string | null;
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
