// Secretariat records (D-04, D-05), mirroring ChildDedication, Marriage and PastoralTerm of
// backend/prisma/schema/secretariat.prisma. Rows reach the UI with the referenced people
// resolved into summaries, and documents of minors arrive masked.

export type MarriageRegistry = 'NOTARY' | 'CHURCH';
export type MarriageEndReason = 'DIVORCE' | 'DEATH' | 'ANNULMENT';

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

/** A person of the denomination as the pickers and tables show it. */
export interface PersonSummary {
  readonly id: number;
  readonly fullName: string;
  /** Member code in their current sede (SC-0130), null when the person is not a member. */
  readonly memberCode: string | null;
  readonly congregationId: number | null;
  readonly sex: 'FEMALE' | 'MALE' | null;
  readonly birthDate: string | null;
  /** Document type plus the last four digits, e.g. "TI ···· 4817". */
  readonly maskedDocument: string | null;
}

export interface RecordsCongregation {
  readonly id: number;
  readonly name: string;
}

/** Catalogs the dialogs need: sedes of the active scope and people of the denomination. */
export interface RecordsContext {
  readonly congregations: readonly RecordsCongregation[];
  readonly people: readonly PersonSummary[];
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
  readonly dedicatedOn: string;
  readonly child: PersonSummary;
  readonly pastor: PersonSummary | null;
  /** In the API the parents come from FamilyRelation; the screen captures them here. */
  readonly father: ParentReference | null;
  readonly mother: ParentReference | null;
}

export interface Marriage {
  readonly id: number;
  readonly denominationId: number;
  readonly spouse1: PersonSummary;
  readonly spouse2: PersonSummary;
  readonly registeredWith: MarriageRegistry | null;
  readonly marriedOn: string | null;
  /** Ceremony place and officiant: required by D-05, pending columns in the Prisma model. */
  readonly place: string | null;
  readonly officiant: PersonSummary | null;
  readonly endedOn: string | null;
  readonly endReason: MarriageEndReason | null;
}

export interface PastoralTerm {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
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

export const ADULT_AGE = 18;

export function isActiveMarriage(marriage: Pick<Marriage, 'endedOn'>): boolean {
  return marriage.endedOn === null;
}

export function personLabel(person: Pick<PersonSummary, 'fullName' | 'memberCode'>): string {
  return person.memberCode ? `${person.fullName} · ${person.memberCode}` : person.fullName;
}

/** The open term of a sede, if any. */
export function currentTerm(terms: readonly PastoralTerm[], congregationId: number): PastoralTerm | null {
  return terms.find((term) => term.congregationId === congregationId && term.endedOn === null) ?? null;
}

/** Today in the local time zone as an ISO date. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The ISO date one day before `isoDate`. */
export function previousDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

/** "8 años y 3 meses" between two ISO dates (the end defaults to today). */
export function durationLabel(from: string, to: string | null, today: string = todayIso()): string {
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
