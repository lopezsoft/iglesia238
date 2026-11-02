// Public (anonymous) view of the membership context, mirroring
// backend/prisma/schema/membership.prisma (MembershipApplication, PrivacyPolicy).
import { ApplicationStatus, Sex } from '../../../../core/models/membership.model';

/** Age from which an applicant answers for themself (Colombian majority). */
export const ADULT_AGE = 18;

/** Submissions accepted per browser session before TOO_MANY_REQUESTS. */
export const MAX_SUBMISSIONS_PER_SESSION = 3;

/** A congregation that accepts applications, with only what the public form shows. */
export interface OpenCongregation {
  readonly id: number;
  readonly denominationId: number;
  readonly denominationName: string;
  readonly name: string;
  readonly municipalityCode: string | null;
  readonly neighborhood: string | null;
  readonly address: string | null;
}

/** Current PrivacyPolicy of a denomination: what the applicant accepts. */
export interface CurrentPrivacyPolicy {
  readonly id: number;
  readonly denominationId: number;
  readonly version: string;
  readonly content: string;
  readonly effectiveFrom: string;
}

export interface ApplicantGuardian {
  readonly name: string;
  readonly document: string;
  /** Spanish label, e.g. "Madre" (formData.guardianRelationship in the API). */
  readonly relationship: string;
  readonly phone: string;
}

/** Body of the public form (POST /public/membership-applications in the API). */
export interface ApplicationSubmission {
  readonly congregationId: number;
  readonly policyId: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly secondLastName: string | null;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  /** ISO date (yyyy-MM-dd). */
  readonly birthDate: string;
  readonly sex: Sex;
  readonly maritalStatusCode: string;
  readonly phone: string;
  readonly email: string | null;
  readonly address: string;
  readonly municipalityCode: string;
  readonly guardian: ApplicantGuardian | null;
  readonly consentAccepted: boolean;
  /** Honeypot: hidden field that only bots fill in. */
  readonly website: string;
}

/** The only thing the applicant gets back: the code to follow the application. */
export interface SubmissionReceipt {
  readonly trackingCode: string;
}

/** Public status of an application: no personal data, ever. */
export interface ApplicationStatusCheck {
  readonly status: ApplicationStatus;
  readonly statusLabel: string;
  /** ISO date-time. */
  readonly submittedOn: string;
  /** ISO date-time, null while nobody has reviewed it. */
  readonly reviewedOn: string | null;
}

export const SEX_OPTIONS: readonly { readonly code: Sex; readonly name: string }[] = [
  { code: 'FEMALE', name: 'Femenino' },
  { code: 'MALE', name: 'Masculino' },
];

export const GUARDIAN_RELATIONSHIPS: readonly string[] = [
  'Madre',
  'Padre',
  'Abuelo(a)',
  'Hermano(a) mayor de edad',
  'Tío(a)',
  'Tutor(a) legal',
  'Otro',
];

/** Today as an ISO date in the local time zone. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
