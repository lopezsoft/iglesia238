// Shared part of the membership context (the API shapes live next to each feature).
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
  readonly documentIssuePlaceCode?: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly secondLastName: string | null;
  readonly sex: Sex | null;
  readonly birthDate: string | null;
  readonly birthPlaceCode?: string | null;
  readonly maritalStatusCode: string | null;
  readonly educationLevelCode: string | null;
  readonly profession: string | null;
  readonly occupation: string | null;
  readonly workplace?: string | null;
  readonly childrenCount?: number | null;
  readonly phone: string | null;
  readonly landlinePhone?: string | null;
  readonly workPhone?: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly neighborhood?: string | null;
  readonly municipalityCode: string | null;
}

export interface PrivacyPolicy {
  readonly id: number;
  readonly denominationId: number;
  readonly version: string;
  readonly content: string;
  readonly effectiveFrom: string;
}

export type ConsentChannel = 'WEB_FORM' | 'PAPER';

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
