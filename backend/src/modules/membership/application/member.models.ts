// Read and write models of the membership module. They are plain data: no Prisma types reach the
// use cases or the controllers, and the shapes match what the frontend consumes.

export type Sex = 'FEMALE' | 'MALE';
export type MemberStatus = 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED';
export type ConsentChannel = 'WEB_FORM' | 'PAPER';
export type FamilyRelationType = 'FATHER' | 'MOTHER' | 'CHILD' | 'GUARDIAN';
export type StudyStatus = 'IN_PROGRESS' | 'COMPLETED';
export type TransferStatus =
  'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';

export const MEMBER_STATUSES: readonly MemberStatus[] = [
  'ACTIVE',
  'INACTIVE',
  'TRANSFERRED',
  'DECEASED',
];

// ---------- List ----------

export type AgeRange =
  'ALL' | 'CHILDREN' | 'TEENAGERS' | 'YOUNG_ADULTS' | 'ADULTS' | 'SENIORS';

/** `NONE` lists members without an open position; a number is a ChurchPosition id. */
export type PositionFilter = 'ALL' | 'NONE' | number;

export type MemberSortField = 'name' | 'joinedOn' | 'age';

/** What the use case asks of the repository: age ranges are already translated into birth dates. */
export interface MemberListCriteria {
  readonly text: string;
  readonly status: 'ALL' | MemberStatus;
  readonly sex: 'ALL' | Sex;
  readonly bornOnOrAfter: string | null;
  readonly bornOnOrBefore: string | null;
  readonly position: PositionFilter;
  readonly congregationId: number | null;
}

export interface MemberListPaging {
  readonly page: number;
  readonly pageSize: number;
  readonly sortBy: MemberSortField;
  readonly order: 'asc' | 'desc';
}

export interface MemberListRow {
  readonly id: number;
  readonly code: string;
  readonly fullName: string;
  readonly sex: Sex | null;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly birthDate: string | null;
  readonly phone: string | null;
  readonly joinedOn: string | null;
  readonly status: MemberStatus;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly positions: readonly string[];
}

export type StatusCounts = Readonly<Record<'ALL' | MemberStatus, number>>;

export interface MemberListResult {
  readonly rows: readonly MemberListRow[];
  readonly total: number;
  readonly statusCounts: StatusCounts;
}

// ---------- Detail ----------

export interface PersonDetail {
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
  readonly documentIssuePlaceCode?: string | null;
  readonly birthPlaceCode?: string | null;
  readonly workplace?: string | null;
  readonly childrenCount?: number | null;
  readonly landlinePhone?: string | null;
  readonly workPhone?: string | null;
  readonly neighborhood?: string | null;
  readonly spouseFullName?: string | null;
  readonly marriageIsCivil?: boolean;
  readonly marriageIsChristian?: boolean;
  readonly marriageIsCatholic?: boolean;
  readonly tribunalOpinion?: string | null;
}

export interface MemberDetail {
  readonly id: number;
  readonly code: string;
  readonly status: MemberStatus;
  readonly joinedOn: string | null;
  readonly isBaptized: boolean | null;
  readonly waterBaptismOn: string | null;
  readonly baptismPlace: string | null;
  readonly previousCongregationName: string | null;
  readonly convertedOn?: string | null;
  readonly baptismMunicipalityCode?: string | null;
  readonly baptizingPastorName?: string | null;
  readonly holySpiritBaptismOn?: string | null;
  readonly reconciledOn?: string | null;
  readonly previousCongregationId?: number | null;
  readonly isChristianEducationTeacher?: boolean;
  readonly desiredAreas?: string | null;
  readonly pastorNotes?: string | null;
  readonly congregationId: number;
  readonly congregationName: string;
  readonly congregationMunicipalityCode: string | null;
  readonly person: PersonDetail;
}

/** The minimum a command needs to know about a member it acts on. */
export interface MemberReference {
  readonly id: number;
  readonly personId: number;
  readonly congregationId: number;
  readonly status: MemberStatus;
  readonly pastoralRankId: number | null;
}

// ---------- Writes ----------

/** Data of a person as the forms send it (catalogs by code). */
export interface PersonData {
  readonly firstName: string;
  readonly lastName: string;
  readonly secondLastName: string | null;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly birthDate: string | null;
  readonly sex: Sex | null;
  readonly maritalStatusCode: string | null;
  readonly educationLevelCode: string | null;
  readonly profession: string | null;
  readonly occupation: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: string | null;
  readonly municipalityCode: string | null;
  readonly documentIssuePlaceCode?: string | null;
  readonly birthPlaceCode?: string | null;
  readonly workplace?: string | null;
  readonly childrenCount?: number | null;
  readonly landlinePhone?: string | null;
  readonly workPhone?: string | null;
  readonly neighborhood?: string | null;
  readonly spouseFullName?: string | null;
  readonly marriageIsCivil?: boolean;
  readonly marriageIsChristian?: boolean;
  readonly marriageIsCatholic?: boolean;
  readonly tribunalOpinion?: string | null;
}

/** Person data once the catalog codes were resolved to ids. */
export interface ResolvedPersonData extends Omit<
  PersonData,
  | 'documentTypeCode'
  | 'maritalStatusCode'
  | 'educationLevelCode'
  | 'municipalityCode'
  | 'documentIssuePlaceCode'
  | 'birthPlaceCode'
> {
  readonly documentTypeId: number | null;
  readonly maritalStatusId: number | null;
  readonly educationLevelId: number | null;
  readonly municipalityId: number | null;
  readonly documentIssuePlaceId?: number | null;
  readonly birthPlaceId?: number | null;
}

export interface MembershipDataPatch {
  readonly joinedOn?: string | null;
  readonly isBaptized?: boolean | null;
  readonly waterBaptismOn?: string | null;
  readonly baptismPlace?: string | null;
  readonly previousCongregationName?: string | null;
  readonly convertedOn?: string | null;
  readonly baptismMunicipalityCode?: string | null;
  readonly baptizingPastorName?: string | null;
  readonly holySpiritBaptismOn?: string | null;
  readonly reconciledOn?: string | null;
  readonly previousCongregationId?: number | null;
  readonly isChristianEducationTeacher?: boolean;
  readonly desiredAreas?: string | null;
  readonly pastorNotes?: string | null;
}

export interface NewMemberRecord {
  readonly personId: number;
  readonly congregationId: number;
  readonly joinedOn: string;
  readonly isBaptized: boolean | null;
  readonly waterBaptismOn: string | null;
  readonly baptismPlace: string | null;
  readonly previousCongregationName: string | null;
  readonly convertedOn?: string | null;
  readonly baptismMunicipalityCode?: string | null;
  readonly baptizingPastorName?: string | null;
  readonly holySpiritBaptismOn?: string | null;
  readonly reconciledOn?: string | null;
  readonly previousCongregationId?: number | null;
  readonly isChristianEducationTeacher?: boolean;
  readonly desiredAreas?: string | null;
  readonly pastorNotes?: string | null;
}

export interface ExistingPerson {
  readonly id: number;
  readonly userId: number | null;
  readonly sex: Sex | null;
  readonly birthDate: string | null;
  readonly hasMember: boolean;
  readonly memberStatus: MemberStatus | null;
}

// ---------- Family ----------

export interface FamilyRelationView {
  readonly id: number;
  readonly type: FamilyRelationType;
  readonly relativeId: number;
  readonly fullName: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly secondLastName?: string | null;
  readonly sex?: Sex | null;
  readonly birthDate?: string | null;
  readonly documentTypeCode: string | null;
  readonly maskedDocument: string | null;
  readonly age: number | null;
  readonly memberId: number | null;
  readonly memberCode: string | null;
  readonly congregationName: string | null;
  readonly memberStatus: MemberStatus | null;
}

export interface RelativePersonInput {
  readonly firstName: string;
  readonly lastName?: string | null;
  readonly secondLastName?: string | null;
  readonly sex?: Sex | null;
  readonly birthDate?: string | null;
  readonly documentTypeId?: number | null;
  readonly documentNumber?: string | null;
}

export interface FamilyRelationRow {
  readonly id: number;
  readonly personId: number;
  readonly relativeId: number;
  readonly type: FamilyRelationType;
}

// ---------- Studies ----------

export interface PersonStudyView {
  readonly id: number;
  readonly studyTypeCode: string;
  readonly name: string;
  readonly institution: string | null;
  readonly status: StudyStatus;
  readonly year: number | null;
}

export interface NewPersonStudy {
  readonly studyTypeCode: string;
  readonly name: string;
  readonly institution: string | null;
  readonly status: StudyStatus;
  readonly year: number | null;
}

// ---------- Positions ----------

export interface CatalogItem {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface MemberPositionRow {
  readonly id: number;
  readonly memberId: number;
  readonly positionId: number;
  readonly positionName: string;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
}

export interface MemberPositionsView {
  readonly pastoralRankId: number | null;
  readonly pastoralRankName: string | null;
  readonly positions: readonly MemberPositionRow[];
  readonly positionCatalog: readonly CatalogItem[];
  readonly rankCatalog: readonly CatalogItem[];
}

// ---------- Socioeconomic profile ----------

export interface SocioeconomicProfileData {
  readonly hasHealthCoverage: boolean | null;
  readonly hasPension: boolean | null;
  readonly hasOccupationalRiskCoverage: boolean | null;
  readonly isSubsidizedRegime: boolean | null;
  readonly hasFamilyCompensation: boolean | null;
  readonly sisbenLevel: number | null;
  readonly isDisplaced: boolean | null;
}

export interface SocioeconomicProfileView extends SocioeconomicProfileData {
  readonly personId: number;
  readonly updatedAt: string;
}

// ---------- Registry, status history and transfers ----------

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

export interface StatusHistoryView {
  readonly id: number;
  readonly status: MemberStatus;
  readonly startedOn: string;
  readonly reason: string | null;
  readonly changedBy: string | null;
}

export interface MemberRegistryView {
  readonly entries: readonly RegistryEntryView[];
  readonly transfers: readonly TransferView[];
  readonly statusHistory: readonly StatusHistoryView[];
}

export interface CongregationRef {
  readonly id: number;
  readonly name: string;
  readonly code: string;
  readonly municipalityCode: string | null;
  readonly isActive: boolean;
}

export interface CurrentRegistryEntry {
  readonly id: number;
  readonly congregationId: number;
  readonly memberNumber: number;
  readonly startedOn: string;
}

export type TransferCommand =
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
  readonly kind: 'INTERNAL' | 'EXTERNAL';
  readonly destinationName: string;
  /** False when the member left the congregation the user acts in. */
  readonly stillVisible: boolean;
}

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

export interface ConsentRow {
  readonly id: number;
  readonly personId: number;
  readonly revokedAt: string | null;
}

export interface PrivacyPolicyRef {
  readonly id: number;
  readonly version: string;
}

// ---------- People search ----------

export type PersonSearchPurpose =
  /** Active members of the congregation (certificates, cards). */
  | 'MEMBER_LOOKUP'
  /** Any person of the denomination except one (relatives of a member). */
  | 'FAMILY_CANDIDATE'
  /** People the secretariat records can reference. */
  | 'SECRETARIAT'
  /** Persons who are not members yet (manual member registration). */
  | 'UNLINKED_PERSON'
  /** People who can contribute: members who are not deceased. */
  | 'CONTRIBUTOR';

export type PersonEligibility =
  'child' | 'spouse' | 'parent' | 'pastor' | 'officiant';

export interface PersonSearchCriteria {
  readonly purpose: PersonSearchPurpose;
  readonly query: string;
  readonly limit: number;
  readonly excludePersonId: number | null;
  /** Congregation that comes first in the results (CONTRIBUTOR). */
  readonly preferredCongregationId: number | null;
  readonly bornOnOrAfter: string | null;
  readonly bornOnOrBefore: string | null;
  readonly includeUnknownBirthDate: boolean;
  readonly withMarriage: boolean;
}

/** What the repository finds. The document still travels complete here: the use case masks it. */
export interface PersonSearchRow {
  readonly personId: number;
  readonly fullName: string;
  readonly documentTypeCode: string | null;
  readonly documentNumber: string | null;
  readonly sex: Sex | null;
  readonly birthDate: string | null;
  readonly memberId: number | null;
  readonly memberCode: string | null;
  readonly memberStatus: MemberStatus | null;
  readonly congregationId: number | null;
  readonly congregationName: string | null;
  readonly isBaptized: boolean | null;
  readonly waterBaptismOn: string | null;
  readonly joinedOn: string | null;
  readonly hasActiveMarriage: boolean;
}

/** A person found by SearchPeople. The document is always masked ("CC ···· 4817"). */
export interface PersonHit {
  readonly personId: number;
  readonly fullName: string;
  readonly documentTypeCode: string | null;
  readonly maskedDocument: string | null;
  readonly sex: Sex | null;
  readonly birthDate: string | null;
  readonly age: number | null;
  readonly memberId: number | null;
  readonly memberCode: string | null;
  readonly memberStatus: MemberStatus | null;
  readonly congregationId: number | null;
  readonly congregationName: string | null;
  readonly isBaptized: boolean | null;
  readonly waterBaptismOn: string | null;
  readonly joinedOn: string | null;
  readonly hasActiveMarriage: boolean;
}
