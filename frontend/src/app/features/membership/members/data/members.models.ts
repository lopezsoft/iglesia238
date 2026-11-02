// Members feature, mirroring backend/prisma/schema/membership.prisma (only what the UI needs).
import { BadgeTone } from '../../../../shared/ui/status-badge.component';
import { Page } from '../../../../shared/utils/pagination';
import {
  ConsentChannel,
  MemberStatus,
  Person,
  Sex,
} from '../../../../core/models/membership.model';

// ---------- List ----------

export type AgeRange = 'ALL' | 'CHILDREN' | 'TEENAGERS' | 'YOUNG_ADULTS' | 'ADULTS' | 'SENIORS';

/** `NONE` lists members without an open position. */
export type PositionFilter = 'ALL' | 'NONE' | number;

export interface MemberFilters {
  readonly text: string;
  readonly status: 'ALL' | MemberStatus;
  readonly sex: 'ALL' | Sex;
  readonly ageRange: AgeRange;
  readonly position: PositionFilter;
}

export interface MemberListQuery extends MemberFilters {
  readonly page: number;
  readonly pageSize: number;
}

export interface MemberListItem {
  readonly id: number;
  readonly code: string;
  readonly fullName: string;
  readonly sex: Sex | null;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly age: number | null;
  readonly phone: string | null;
  readonly joinedOn: string | null;
  readonly status: MemberStatus;
  readonly congregationId: number;
  readonly congregationName: string;
  /** Open positions of the member. */
  readonly positions: readonly string[];
}

export type StatusCounts = Readonly<Record<'ALL' | MemberStatus, number>>;

export interface MemberListPage extends Page<MemberListItem> {
  /** Rows per status with every other filter applied (chips of the toolbar). */
  readonly statusCounts: StatusCounts;
}

// ---------- Detail ----------

export interface MemberDetail {
  readonly id: number;
  readonly code: string;
  readonly status: MemberStatus;
  readonly joinedOn: string | null;
  readonly isBaptized: boolean | null;
  readonly waterBaptismOn: string | null;
  readonly previousCongregationName: string | null;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly congregationMunicipalityCode: string | null;
  readonly person: Person;
}

export interface PersonUpdate {
  readonly firstName: string;
  readonly lastName: string;
  readonly secondLastName: string | null;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly birthDate: string | null;
  readonly sex: Sex | null;
  readonly maritalStatusCode: string | null;
  readonly educationLevelCode: string | null;
  readonly occupation: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly municipalityCode: string | null;
}

// ---------- Family ----------

/** The spouse is not here: its single source of truth is Marriage. */
export type FamilyRelationType = 'FATHER' | 'MOTHER' | 'CHILD' | 'GUARDIAN';

/** `type` is what the relative is to the person (the relative is the FATHER of the person). */
export interface FamilyRelation {
  readonly id: number;
  readonly denominationId: number;
  readonly personId: number;
  readonly relativeId: number;
  readonly type: FamilyRelationType;
}

export interface FamilyRelationView {
  readonly id: number;
  readonly type: FamilyRelationType;
  readonly relativeId: number;
  readonly fullName: string;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly age: number | null;
  /** Member id when the relative is a member the user can open. */
  readonly memberId: number | null;
  readonly memberCode: string | null;
  readonly congregationName: string | null;
  readonly memberStatus: MemberStatus | null;
}

export interface PersonOption {
  readonly id: number;
  readonly fullName: string;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly congregationName: string | null;
}

export interface FamilyRelationInput {
  readonly relativeId: number;
  readonly type: FamilyRelationType;
}

// ---------- Studies ----------

export type StudyStatus = 'IN_PROGRESS' | 'COMPLETED';

/** Flattened view of PersonStudy and its Study (type and name) plus the institution. */
export interface PersonStudy {
  readonly id: number;
  readonly denominationId: number;
  readonly personId: number;
  readonly studyTypeCode: string;
  readonly name: string;
  readonly institution: string | null;
  readonly status: StudyStatus;
  /** Year it was completed or, while in progress, the year it started. */
  readonly year: number | null;
}

export type PersonStudyInput = Pick<
  PersonStudy,
  'studyTypeCode' | 'name' | 'institution' | 'status' | 'year'
>;

// ---------- Positions and pastoral rank ----------

export interface ChurchPosition {
  readonly id: number;
  readonly denominationId: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface PastoralRank {
  readonly id: number;
  readonly denominationId: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface MemberPosition {
  readonly id: number;
  readonly denominationId: number;
  readonly memberId: number;
  readonly positionId: number;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
}

/** Member.pastoralRankId of the API; the shared demo Member row does not carry it. */
export interface MemberPastoralRank {
  readonly memberId: number;
  readonly pastoralRankId: number | null;
}

export interface MemberPositionView extends MemberPosition {
  readonly positionName: string;
}

export interface MemberPositionsView {
  readonly pastoralRankId: number | null;
  readonly pastoralRankName: string | null;
  readonly positions: readonly MemberPositionView[];
  readonly positionCatalog: readonly ChurchPosition[];
  readonly rankCatalog: readonly PastoralRank[];
}

export interface PositionAssignmentInput {
  readonly positionId: number;
  readonly startedOn: string;
}

// ---------- Socioeconomic profile ----------

/** Separate from Person so it needs its own permission. Yes/no affiliations, never medical data. */
export interface SocioeconomicProfile {
  readonly personId: number;
  readonly denominationId: number;
  readonly hasHealthCoverage: boolean | null;
  readonly hasPension: boolean | null;
  readonly hasOccupationalRiskCoverage: boolean | null;
  readonly isSubsidizedRegime: boolean | null;
  readonly hasFamilyCompensation: boolean | null;
  readonly sisbenLevel: number | null;
  readonly isDisplaced: boolean | null;
  readonly updatedAt: string;
}

export type SocioeconomicProfileInput = Omit<
  SocioeconomicProfile,
  'personId' | 'denominationId' | 'updatedAt'
>;

export type SocioeconomicFlag = Exclude<keyof SocioeconomicProfileInput, 'sisbenLevel'>;

export const SOCIOECONOMIC_FLAGS: readonly {
  readonly key: SocioeconomicFlag;
  readonly label: string;
}[] = [
  { key: 'hasHealthCoverage', label: 'Afiliación a salud (EPS)' },
  { key: 'isSubsidizedRegime', label: 'Régimen subsidiado' },
  { key: 'hasPension', label: 'Afiliación a pensión' },
  { key: 'hasOccupationalRiskCoverage', label: 'Afiliación a riesgos laborales (ARL)' },
  { key: 'hasFamilyCompensation', label: 'Caja de compensación familiar' },
  { key: 'isDisplaced', label: 'Población desplazada' },
];

export const SISBEN_LEVELS = [1, 2, 3, 4, 5, 6] as const;

// ---------- Registry and transfers ----------

export type TransferStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export interface MemberTransfer {
  readonly id: number;
  readonly denominationId: number;
  readonly memberId: number;
  readonly originCongregationId: number;
  readonly destinationCongregationId: number | null;
  readonly externalDestinationName: string | null;
  readonly status: TransferStatus;
  readonly transferDate: string;
  readonly approvedById: number | null;
  readonly approvedAt: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
}

export interface RegistryEntryView {
  readonly id: number;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly memberNumber: number;
  readonly code: string;
  readonly registryBook: string | null;
  readonly registryFolio: string | null;
  readonly startedOn: string;
  readonly endedOn: string | null;
}

export interface TransferView {
  readonly id: number;
  readonly originName: string;
  readonly destinationName: string;
  readonly isExternal: boolean;
  readonly status: TransferStatus;
  readonly transferDate: string;
  readonly notes: string | null;
}

export interface MemberRegistryView {
  readonly entries: readonly RegistryEntryView[];
  readonly transfers: readonly TransferView[];
}

export interface CongregationOption {
  readonly id: number;
  readonly name: string;
  readonly municipalityCode: string | null;
}

export type TransferInput =
  | {
      readonly kind: 'INTERNAL';
      readonly destinationCongregationId: number;
      readonly transferDate: string;
      readonly reason: string;
    }
  | {
      readonly kind: 'EXTERNAL';
      readonly externalDestinationName: string;
      readonly transferDate: string;
      readonly reason: string;
    };

export interface TransferResult {
  readonly kind: TransferInput['kind'];
  readonly destinationName: string;
  /** False when the member left the scope the user acts on (internal transfer from a sede). */
  readonly stillVisible: boolean;
}

export const TRANSFER_REASONS: readonly string[] = [
  'Cambio de residencia',
  'Solicitud personal',
  'Envío ministerial',
  'Otro',
];

// ---------- Consents ----------

export interface ConsentView {
  readonly id: number;
  readonly policyVersion: string;
  readonly policyEffectiveFrom: string | null;
  readonly channel: ConsentChannel;
  readonly grantedAt: string;
  readonly revokedAt: string | null;
  readonly guardianName: string | null;
}

// ---------- Labels ----------

export const MEMBER_STATUS_TONES: Readonly<Record<MemberStatus, BadgeTone>> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  TRANSFERRED: 'info',
  DECEASED: 'warning',
};

export const STATUS_FILTER_OPTIONS: readonly {
  readonly value: 'ALL' | MemberStatus;
  readonly label: string;
}[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'INACTIVE', label: 'Inactivos' },
  { value: 'TRANSFERRED', label: 'Trasladados' },
  { value: 'DECEASED', label: 'Fallecidos' },
];

export const SEX_LABELS: Readonly<Record<Sex, string>> = {
  FEMALE: 'Femenino',
  MALE: 'Masculino',
};

export interface AgeRangeOption {
  readonly value: AgeRange;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

export const AGE_RANGES: readonly AgeRangeOption[] = [
  { value: 'ALL', label: 'Todas las edades', min: 0, max: Number.POSITIVE_INFINITY },
  { value: 'CHILDREN', label: '0 a 11 (Niños)', min: 0, max: 11 },
  { value: 'TEENAGERS', label: '12 a 17 (Adolescentes)', min: 12, max: 17 },
  { value: 'YOUNG_ADULTS', label: '18 a 29', min: 18, max: 29 },
  { value: 'ADULTS', label: '30 a 59', min: 30, max: 59 },
  { value: 'SENIORS', label: '60 y más', min: 60, max: Number.POSITIVE_INFINITY },
];

export const FAMILY_RELATION_LABELS: Readonly<Record<FamilyRelationType, string>> = {
  FATHER: 'Padre',
  MOTHER: 'Madre',
  CHILD: 'Hijo(a)',
  GUARDIAN: 'Acudiente',
};

export const FAMILY_RELATION_TYPES: readonly FamilyRelationType[] = [
  'FATHER',
  'MOTHER',
  'CHILD',
  'GUARDIAN',
];

export const STUDY_STATUS_LABELS: Readonly<Record<StudyStatus, string>> = {
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Finalizado',
};

export const TRANSFER_STATUS_LABELS: Readonly<Record<TransferStatus, string>> = {
  REQUESTED: 'Solicitado',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

export const CONSENT_CHANNEL_LABELS: Readonly<Record<ConsentChannel, string>> = {
  WEB_FORM: 'Formulario web',
  PAPER: 'Formato físico firmado',
};

export function documentLabel(typeCode: string | null, number: string | null): string {
  if (!number) {
    return '—';
  }
  return typeCode ? `${typeCode} ${number}` : number;
}

/** Today as an ISO date (YYYY-MM-DD) in local time. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** First letter of the first given name and of the first last name (Ana María Rojas → AR). */
export function initialsOf(firstName: string, lastName: string): string {
  return [firstName, lastName].map((name) => name.trim().charAt(0).toUpperCase()).join('');
}
