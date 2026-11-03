import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type {
  CatalogItem,
  ConsentRow,
  ConsentView,
  CongregationRef,
  CurrentRegistryEntry,
  FamilyRelationRow,
  FamilyRelationType,
  FamilyRelationView,
  MemberPositionRow,
  MemberRegistryView,
  MemberStatus,
  PersonSearchCriteria,
  PersonSearchRow,
  PersonStudyView,
  PrivacyPolicyRef,
  SocioeconomicProfileData,
  SocioeconomicProfileView,
  StudyStatus,
} from '../member.models.js';

export const FAMILY_REPOSITORY = Symbol('FAMILY_REPOSITORY');
export const STUDY_REPOSITORY = Symbol('STUDY_REPOSITORY');
export const POSITION_REPOSITORY = Symbol('POSITION_REPOSITORY');
export const SOCIOECONOMIC_REPOSITORY = Symbol('SOCIOECONOMIC_REPOSITORY');
export const REGISTRY_REPOSITORY = Symbol('REGISTRY_REPOSITORY');
export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');
export const PEOPLE_SEARCH_REPOSITORY = Symbol('PEOPLE_SEARCH_REPOSITORY');

export interface FamilyRepository {
  /** Relatives of a person. `memberId` is set only when that member is visible in the scope. */
  list(scope: TenantScope, personId: number): Promise<FamilyRelationView[]>;
  rowsOf(
    scope: TenantScope,
    personId: number,
    transaction?: Transaction,
  ): Promise<FamilyRelationRow[]>;
  add(
    scope: TenantScope,
    personId: number,
    relativeId: number,
    type: FamilyRelationType,
    transaction: Transaction,
  ): Promise<number>;
  remove(
    scope: TenantScope,
    relationId: number,
    transaction: Transaction,
  ): Promise<void>;
}

export interface NewStudyRecord {
  readonly studyTypeId: number;
  readonly name: string;
  readonly institution: string | null;
  readonly status: StudyStatus;
  readonly year: number | null;
}

export interface StudyRepository {
  list(scope: TenantScope, personId: number): Promise<PersonStudyView[]>;
  /** Creates the study when the denomination does not have it yet. Null when the person already has it. */
  add(
    scope: TenantScope,
    personId: number,
    record: NewStudyRecord,
    transaction: Transaction,
  ): Promise<number | null>;
  remove(
    scope: TenantScope,
    personId: number,
    personStudyId: number,
    transaction: Transaction,
  ): Promise<boolean>;
}

export interface PositionRepository {
  positionsOf(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberPositionRow[]>;
  openPositionsOf(
    scope: TenantScope,
    memberId: number,
    transaction?: Transaction,
  ): Promise<MemberPositionRow[]>;
  findRow(
    scope: TenantScope,
    memberId: number,
    memberPositionId: number,
  ): Promise<MemberPositionRow | null>;
  positionCatalog(scope: TenantScope): Promise<CatalogItem[]>;
  rankCatalog(scope: TenantScope): Promise<CatalogItem[]>;
  add(
    scope: TenantScope,
    memberId: number,
    positionId: number,
    startedOn: string,
    transaction: Transaction,
  ): Promise<number>;
  close(
    scope: TenantScope,
    memberPositionId: number,
    endedOn: string,
    transaction: Transaction,
  ): Promise<void>;
}

export interface SocioeconomicRepository {
  find(
    scope: TenantScope,
    personId: number,
  ): Promise<SocioeconomicProfileView | null>;
  save(
    scope: TenantScope,
    personId: number,
    data: SocioeconomicProfileData,
    transaction: Transaction,
  ): Promise<SocioeconomicProfileView>;
}

export interface NewTransferRecord {
  readonly memberId: number;
  readonly originCongregationId: number;
  readonly destinationCongregationId: number | null;
  readonly externalDestinationName: string | null;
  readonly transferDate: string;
  readonly notes: string;
  readonly approvedById: number | null;
}

export interface NewRegistryEntry {
  readonly memberId: number;
  readonly congregationId: number;
  readonly memberNumber: number;
  readonly startedOn: string;
  readonly registryBook: string | null;
  readonly registryFolio: string | null;
}

export interface RegistryRepository {
  view(scope: TenantScope, memberId: number): Promise<MemberRegistryView>;
  currentEntry(
    scope: TenantScope,
    memberId: number,
    transaction?: Transaction,
  ): Promise<CurrentRegistryEntry | null>;
  openEntry(
    scope: TenantScope,
    entry: NewRegistryEntry,
    transaction: Transaction,
  ): Promise<number>;
  closeCurrentEntry(
    scope: TenantScope,
    memberId: number,
    endedOn: string,
    transaction: Transaction,
  ): Promise<void>;
  addStatusHistory(
    scope: TenantScope,
    entry: {
      memberId: number;
      status: MemberStatus;
      startedOn: string;
      reason: string | null;
      userId: number | null;
    },
    transaction: Transaction,
  ): Promise<void>;
  /** A congregation of the denomination (not only the scope's), or null. */
  findCongregation(
    scope: TenantScope,
    congregationId: number,
    transaction?: Transaction,
  ): Promise<CongregationRef | null>;
  /** Active congregations of the denomination other than `exceptCongregationId`. */
  listDestinations(
    scope: TenantScope,
    exceptCongregationId: number,
  ): Promise<CongregationRef[]>;
  addTransfer(
    scope: TenantScope,
    record: NewTransferRecord,
    transaction: Transaction,
  ): Promise<number>;
}

export interface NewConsentRecord {
  readonly personId: number;
  readonly guardianId: number | null;
  readonly policyId: number;
  readonly channel: 'WEB_FORM' | 'PAPER';
  readonly grantedAt: Date;
}

export interface ConsentRepository {
  list(scope: TenantScope, personId: number): Promise<ConsentView[]>;
  find(
    scope: TenantScope,
    personId: number,
    consentId: number,
    transaction?: Transaction,
  ): Promise<ConsentRow | null>;
  /** How many consents of the person are still in force. */
  countInForce(
    scope: TenantScope,
    personId: number,
    transaction?: Transaction,
  ): Promise<number>;
  countAll(scope: TenantScope, personId: number): Promise<number>;
  revoke(
    scope: TenantScope,
    consentId: number,
    revokedAt: Date,
    transaction: Transaction,
  ): Promise<void>;
  /** Published policy in force on `today`, if any. */
  currentPolicy(
    scope: TenantScope,
    today: string,
  ): Promise<PrivacyPolicyRef | null>;
  grant(
    scope: TenantScope,
    record: NewConsentRecord,
    transaction: Transaction,
  ): Promise<number>;
}

export interface PeopleSearchRepository {
  search(
    scope: TenantScope,
    criteria: PersonSearchCriteria,
  ): Promise<PersonSearchRow[]>;
}
