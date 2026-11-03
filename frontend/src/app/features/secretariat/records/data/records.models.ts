// Secretariat records (D-04, D-05), mirroring the `/api/child-dedications`, `/api/marriages`,
// `/api/pastoral-terms` and `/api/secretariat/*` contract. Rows reach the UI with the people
// resolved into summaries; documents arrive masked and the server decides who may see what.

export type MarriageRegistry = 'NOTARY' | 'CHURCH';
export type MarriageEndReason = 'DIVORCE' | 'DEATH' | 'ANNULMENT';
export type MarriageStatus = 'ACTIVE' | 'DISSOLVED';
export type PersonEligibility = 'child' | 'spouse' | 'parent' | 'pastor' | 'officiant';

export const MARRIAGE_REGISTRY_LABELS: Readonly<Record<MarriageRegistry, string>> = {
  NOTARY: 'Notaría (civil)',
  CHURCH: 'Iglesia',
};

export const MARRIAGE_END_REASON_LABELS: Readonly<Record<MarriageEndReason, string>> = {
  DIVORCE: 'Divorcio',
  DEATH: 'Fallecimiento de un cónyuge',
  ANNULMENT: 'Nulidad',
};

export const MARRIAGE_REGISTRIES = Object.keys(MARRIAGE_REGISTRY_LABELS) as MarriageRegistry[];
export const MARRIAGE_END_REASONS = Object.keys(MARRIAGE_END_REASON_LABELS) as MarriageEndReason[];

export const RECORDS_PAGE_SIZE = 10;
export const MAX_PLACE_LENGTH = 150;
export const MAX_PARENT_NAME_LENGTH = 120;
export const ADULT_AGE = 18;

/** A person of the denomination as the pickers and tables show it. */
export interface PersonSummary {
  readonly id: number;
  readonly fullName: string;
  /** Member code in their current sede (SC-0130), null when the person is not a member. */
  readonly memberCode: string | null;
  /** Current sede of the member, null when the person is not a member. */
  readonly congregationId: number | null;
  readonly sex: 'FEMALE' | 'MALE' | null;
  readonly birthDate: string | null;
  readonly age: number | null;
  /** Document type plus the last four digits, e.g. "TI ···· 4817". Never the full number. */
  readonly maskedDocument: string | null;
}

/** A search result of the people picker. */
export interface PersonOption extends PersonSummary {
  /** Already has a marriage in force: cannot be a spouse again. */
  readonly hasActiveMarriage: boolean;
}

export interface RecordsCongregation {
  readonly id: number;
  readonly name: string;
}

/** What the screen needs before it renders: the sedes of the active scope and the server date. */
export interface RecordsContext {
  readonly today: string;
  readonly congregations: readonly RecordsCongregation[];
}

export interface RecordsSummary {
  readonly year: number;
  readonly dedicationsThisYear: number;
  readonly dedicationsTotal: number;
  readonly marriagesActive: number;
  readonly marriagesDissolved: number;
  readonly termsTotal: number;
  /** Only when the scope is a single sede. */
  readonly currentPastor: {
    readonly congregationId: number;
    readonly congregationName: string;
    readonly fullName: string;
    readonly startedOn: string;
  } | null;
  readonly congregationsWithPastor: number;
  readonly congregationsTotal: number;
}

/** A parent: a registered person or, when not registered, only a name. */
export interface ParentReference {
  readonly personId: number | null;
  readonly name: string;
  readonly memberCode: string | null;
}

export interface ChildDedication {
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

export interface Marriage {
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

export interface PastoralTerm {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly pastor: PersonSummary;
  readonly startedOn: string;
  /** Null while the term is open (current pastor). */
  readonly endedOn: string | null;
}

export interface ParentInput {
  readonly personId: number | null;
  readonly name: string | null;
}

export interface ChildDedicationInput {
  readonly congregationId: number;
  readonly childId: number;
  readonly dedicatedOn: string;
  readonly pastorId: number | null;
  readonly father: ParentInput | null;
  readonly mother: ParentInput | null;
  readonly guardian: ParentInput | null;
}

export interface MarriageInput {
  readonly spouse1Id: number;
  readonly spouse2Id: number;
  readonly marriedOn: string;
  readonly place: string;
  readonly registeredWith: MarriageRegistry;
  readonly officiantId: number | null;
}

export interface MarriageDissolutionInput {
  readonly endedOn: string;
  readonly endReason: MarriageEndReason;
}

export interface PastoralTermInput {
  readonly congregationId: number;
  readonly pastorId: number;
  readonly startedOn: string;
  readonly endedOn: string | null;
  /** Closes the open term of the sede the day before `startedOn`. */
  readonly closeCurrent: boolean;
}

export interface DedicationQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly congregationId?: number | null;
  readonly q?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
}

export interface MarriageQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: 'active' | 'dissolved' | null;
  readonly q?: string | null;
  readonly from?: string | null;
  readonly to?: string | null;
}

export interface PastoralTermQuery {
  readonly congregationId?: number | null;
  readonly current?: boolean;
}

export interface PeopleQuery {
  readonly q: string;
  readonly eligibleFor?: PersonEligibility;
  readonly limit?: number;
}

export function isActiveMarriage(marriage: Pick<Marriage, 'status'>): boolean {
  return marriage.status === 'ACTIVE';
}

export function personLabel(person: Pick<PersonSummary, 'fullName' | 'memberCode'>): string {
  return person.memberCode ? `${person.fullName} · ${person.memberCode}` : person.fullName;
}

/** The open term of a sede, if any. */
export function currentTerm(
  terms: readonly PastoralTerm[],
  congregationId: number,
): PastoralTerm | null {
  return (
    terms.find((term) => term.congregationId === congregationId && term.endedOn === null) ?? null
  );
}

/** The ISO date one day before `isoDate`. */
export function previousDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** "8 años y 3 meses" between two ISO dates (the end defaults to `today`). */
export function durationLabel(from: string, to: string | null, today: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = (to ?? today).split('-').map(Number);
  const totalMonths = Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts = [
    years > 0 ? `${years} ${years === 1 ? 'año' : 'años'}` : null,
    months > 0 ? `${months} ${months === 1 ? 'mes' : 'meses'}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(' y ') : 'Menos de un mes';
}
