// Secretariat records: presentations of children, marriages and pastoral terms. Dates are ISO
// (`YYYY-MM-DD`); documents of people always travel masked.

export type Sex = 'FEMALE' | 'MALE';
export type MarriageRegistry = 'NOTARY' | 'CHURCH';
export type MarriageEndReason = 'DIVORCE' | 'DEATH' | 'ANNULMENT';
export type MarriageStatus = 'ACTIVE' | 'DISSOLVED';
export type ParentRole = 'FATHER' | 'MOTHER' | 'GUARDIAN';
export type PersonEligibility =
  'child' | 'spouse' | 'parent' | 'pastor' | 'officiant';

export const MAX_PARENT_NAME_LENGTH = 120;
export const MAX_PLACE_LENGTH = 150;
export const MAX_RECORD_LIST_SIZE = 100;

export interface NamedOption {
  readonly id: number;
  readonly name: string;
}

/** A person as the pickers and tables show it. The document is masked ("TI ···· 4817"). */
export interface PersonSummary {
  readonly id: number;
  readonly fullName: string;
  /** Code in the current sede (SC-0130); null when the person is not a member. */
  readonly memberCode: string | null;
  /** Current sede of the member; null when the person is not a member. */
  readonly congregationId: number | null;
  readonly sex: Sex | null;
  readonly birthDate: string | null;
  readonly age: number | null;
  readonly maskedDocument: string | null;
}

/** A search result: the summary plus what the pickers use to exclude the person. */
export interface PersonOption extends PersonSummary {
  readonly hasActiveMarriage: boolean;
}

/** A parent: a registered person or, when not registered, only a name. */
export interface ParentReference {
  readonly personId: number | null;
  readonly name: string;
  readonly memberCode: string | null;
}

export interface ChildDedicationRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly dedicatedOn: string;
  readonly child: PersonSummary;
  readonly pastor: PersonSummary | null;
  readonly father: ParentReference | null;
  readonly mother: ParentReference | null;
  readonly guardian: ParentReference | null;
}

export interface MarriageRecord {
  readonly id: number;
  /** Display number, MAT-0007. */
  readonly code: string;
  readonly denominationId: number;
  readonly spouse1: PersonSummary;
  readonly spouse2: PersonSummary;
  readonly registeredWith: MarriageRegistry | null;
  readonly marriedOn: string | null;
  readonly place: string | null;
  readonly officiant: PersonSummary | null;
  readonly endedOn: string | null;
  readonly endReason: MarriageEndReason | null;
  readonly status: MarriageStatus;
}

export interface PastoralTermRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly pastor: PersonSummary;
  readonly startedOn: string;
  /** Null while the term is open (current pastor). */
  readonly endedOn: string | null;
}

/** A term as the overlap rules see it. */
export interface TermPeriod {
  readonly id: number;
  readonly startedOn: string;
  readonly endedOn: string | null;
}

export interface ParentInput {
  /** A registered person. */
  readonly personId?: number | null;
  /** Free name, used when the parent is not registered. */
  readonly name?: string | null;
}

export interface DedicationFilter {
  readonly congregationId?: number;
  readonly q?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface MarriageFilter {
  readonly status?: 'active' | 'dissolved';
  readonly q?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface PastoralTermFilter {
  readonly congregationId?: number;
  readonly currentOnly?: boolean;
}

export function marriageCode(id: number): string {
  return `MAT-${String(id).padStart(4, '0')}`;
}
