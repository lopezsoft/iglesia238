// Shared part of the membership context, mirroring backend/prisma/schema/membership.prisma.
// Contacts and addresses live in their own tables in the API; the frontend view flattens the
// primary ones into the person.

export type Sex = 'FEMALE' | 'MALE';
export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED';
export type ApplicationStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'DUPLICATE';

export interface Person {
  readonly id: number;
  readonly denominationId: number;
  readonly userId: number | null;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly secondLastName: string | null;
  readonly sex: Sex | null;
  readonly birthDate: string | null;
  readonly maritalStatusCode: string | null;
  readonly educationLevelCode: string | null;
  readonly profession: string | null;
  readonly occupation: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly municipalityCode: string | null;
}

export interface Member {
  readonly id: number;
  readonly denominationId: number;
  readonly personId: number;
  readonly congregationId: number;
  readonly status: MemberStatus;
  readonly joinedOn: string | null;
  readonly isBaptized: boolean | null;
  readonly waterBaptismOn: string | null;
  readonly previousCongregationName: string | null;
}

/** Book, folio and member number of a member in a congregation. */
export interface MemberRegistryEntry {
  readonly id: number;
  readonly denominationId: number;
  readonly memberId: number;
  readonly congregationId: number;
  readonly memberNumber: number;
  readonly registryBook: string | null;
  readonly registryFolio: string | null;
  readonly startedOn: string;
  readonly endedOn: string | null;
}

export interface PrivacyPolicy {
  readonly id: number;
  readonly denominationId: number;
  readonly version: string;
  readonly content: string;
  readonly effectiveFrom: string;
}

export type ConsentChannel = 'WEB_FORM' | 'PAPER';

/** Authorization to process personal data (Ley 1581 de 2012). Revoking never deletes it. */
export interface DataConsent {
  readonly id: number;
  readonly denominationId: number;
  readonly personId: number;
  /** Person who authorizes on behalf of a minor. */
  readonly guardianId: number | null;
  readonly policyId: number;
  readonly channel: ConsentChannel;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
}

/** Answers of the public form that have no column of their own (formData in the API). */
export interface ApplicationFormData {
  readonly secondLastName: string | null;
  readonly sex: Sex | null;
  readonly maritalStatusCode: string | null;
  readonly address: string | null;
  readonly municipalityCode: string | null;
  readonly guardianRelationship: string | null;
  readonly guardianPhone: string | null;
  readonly previousCongregationName: string | null;
}

export interface MembershipApplication {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly policyId: number;
  /** Demo only: the API returns the code once and stores only its hash. */
  readonly trackingCode: string;
  readonly status: ApplicationStatus;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly birthDate: string | null;
  readonly guardianName: string | null;
  readonly guardianDocument: string | null;
  readonly formData: ApplicationFormData;
  readonly consentedAt: string;
  readonly reviewerId: number | null;
  readonly reviewedAt: string | null;
  readonly rejectionReason: string | null;
  readonly matchedPersonId: number | null;
  readonly memberId: number | null;
  readonly createdAt: string;
}

export const MEMBER_STATUS_LABELS: Readonly<Record<MemberStatus, string>> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  TRANSFERRED: 'Trasladado',
  DECEASED: 'Fallecido',
};

export const APPLICATION_STATUS_LABELS: Readonly<Record<ApplicationStatus, string>> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  DUPLICATE: 'Duplicada',
};

export function personFullName(person: Pick<Person, 'firstName' | 'lastName' | 'secondLastName'>): string {
  return [person.firstName, person.lastName, person.secondLastName].filter(Boolean).join(' ');
}

/** Age in whole years on `today` (ISO date), or null without a birth date. */
export function ageOn(birthDate: string | null, today: string): number | null {
  if (!birthDate) {
    return null;
  }
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
