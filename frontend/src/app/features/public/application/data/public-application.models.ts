// Public (anonymous) view of the membership application, mirroring the API under /api/public.
import { Sex } from '../../../../core/models/membership.model';
import { bogotaTodayIso } from '../../../../core/time/bogota-date';

/** Age from which an applicant answers for themself (Colombian majority). */
export const ADULT_AGE = 18;

/** A congregation that accepts applications, with only what the public form shows. */
export interface OpenCongregation {
  readonly id: number;
  readonly denominationId: number;
  readonly denominationName: string;
  readonly name: string;
  readonly municipalityCode: string | null;
  readonly municipalityName: string | null;
  readonly regionName: string | null;
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

/** Adult who answers for a minor applicant. */
export interface ApplicantGuardian {
  readonly firstName: string;
  readonly lastName: string;
  readonly documentTypeCode: string;
  readonly documentNumber: string;
  /** Spanish label, one of GUARDIAN_RELATIONSHIPS. */
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
  /** DIVIPOLA code. */
  readonly municipalityCode: string;
  readonly neighborhood: string | null;
  readonly occupation: string | null;
  readonly previousCongregationName: string | null;
  /** null: the applicant did not say. */
  readonly isBaptized: boolean | null;
  readonly guardian: ApplicantGuardian | null;
  readonly consentAccepted: boolean;
  /** Honeypot: hidden field that only bots fill in. */
  readonly website: string;
}

/** The only thing the applicant gets back: the code to follow the application. */
export interface SubmissionReceipt {
  readonly trackingCode: string;
}

export type PublicApplicationStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

/** Public status of an application: no personal data and no reviewer reason, ever. */
export interface ApplicationStatusCheck {
  readonly status: PublicApplicationStatus;
  readonly statusLabel: string;
  /** ISO date-time. */
  readonly submittedOn: string;
  /** ISO date-time, null until the application is decided. */
  readonly reviewedOn: string | null;
  /** Generic notice of a rejection; the reason stays inside the secretariat. */
  readonly notice: string | null;
}

export interface CatalogOption {
  readonly code: string;
  readonly name: string;
}

/** Catalogs the form needs (GET /public/catalogs). */
export interface PublicCatalogs {
  readonly documentTypes: readonly CatalogOption[];
  readonly maritalStatuses: readonly CatalogOption[];
}

/** Result of the municipality search (GET /public/geo/municipalities). */
export interface MunicipalityOption {
  readonly code: string;
  readonly name: string;
  readonly regionName: string;
}

/** Optional limits of the municipality search. */
export interface MunicipalityFilter {
  /** At most this many results (the API default otherwise). */
  readonly limit?: number;
  /** Only municipalities of this country; every country when it is left out. */
  readonly countryId?: number | null;
}

export function municipalityOptionLabel(option: Pick<MunicipalityOption, 'name' | 'regionName'>): string {
  return `${option.name} (${option.regionName})`;
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

export const BAPTISM_OPTIONS: readonly { readonly value: 'yes' | 'no' | 'unknown'; readonly name: string }[] = [
  { value: 'unknown', name: 'Prefiero no decirlo' },
  { value: 'yes', name: 'Sí, estoy bautizado(a)' },
  { value: 'no', name: 'No estoy bautizado(a)' },
];

/** Today as an ISO date in Bogota, the day the API compares against. */
export function todayIso(now: Date = new Date()): string {
  return bogotaTodayIso(now);
}
