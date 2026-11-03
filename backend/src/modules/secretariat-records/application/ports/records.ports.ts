import type { Page } from '../../../../common/pagination/page.js';
import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type {
  ChildDedicationRecord,
  DedicationFilter,
  MarriageEndReason,
  MarriageFilter,
  MarriageRecord,
  MarriageRegistry,
  NamedOption,
  ParentRole,
  PastoralTermFilter,
  PastoralTermRecord,
  PersonEligibility,
  PersonOption,
  PersonSummary,
  TermPeriod,
} from '../records.models.js';

export const CONGREGATION_DIRECTORY = Symbol('RECORDS_CONGREGATION_DIRECTORY');
export const PEOPLE_DIRECTORY = Symbol('RECORDS_PEOPLE_DIRECTORY');
export const PEOPLE_SEARCH = Symbol('RECORDS_PEOPLE_SEARCH');
export const CHILD_DEDICATION_REPOSITORY = Symbol(
  'CHILD_DEDICATION_REPOSITORY',
);
export const MARRIAGE_REPOSITORY = Symbol('MARRIAGE_REPOSITORY');
export const PASTORAL_TERM_REPOSITORY = Symbol('PASTORAL_TERM_REPOSITORY');

export interface CongregationDirectory {
  /** Active congregations of the scope (one for a sede scope, all of the denomination otherwise). */
  listActive(scope: TenantScope): Promise<NamedOption[]>;
  findActive(scope: TenantScope, id: number): Promise<NamedOption | null>;
}

/** Reads the people the records reference. They belong to the denomination of the scope. */
export interface PeopleDirectory {
  /** Summaries of the people that exist in the denomination; missing or foreign ids are simply absent. */
  findByIds(
    scope: TenantScope,
    ids: readonly number[],
  ): Promise<PersonSummary[]>;
  /** Registers a relative that only has a name (a parent who is not in the system). */
  createNameOnly(
    scope: TenantScope,
    fullName: string,
    transaction: Transaction,
  ): Promise<number>;
  /** Serializes concurrent changes of the same people (`SELECT ... FOR UPDATE`). */
  lock(
    scope: TenantScope,
    ids: readonly number[],
    transaction: Transaction,
  ): Promise<void>;
}

/** Search of people; the adapter delegates to the shared SearchPeople use case. */
export interface PeopleSearch {
  search(
    scope: TenantScope,
    params: {
      query: string;
      limit?: number;
      eligibleFor?: PersonEligibility;
    },
  ): Promise<PersonOption[]>;
}

export interface NewChildDedication {
  readonly congregationId: number;
  readonly childId: number;
  readonly pastorId: number | null;
  readonly dedicatedOn: string;
  readonly parents: readonly { role: ParentRole; personId: number }[];
}

export interface ChildDedicationRepository {
  list(
    scope: TenantScope,
    filter: DedicationFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<ChildDedicationRecord>>;
  find(scope: TenantScope, id: number): Promise<ChildDedicationRecord | null>;
  /** Whether the child was already presented (in any sede of the denomination). */
  existsForChild(
    scope: TenantScope,
    childId: number,
    transaction?: Transaction,
  ): Promise<boolean>;
  create(
    scope: TenantScope,
    data: NewChildDedication,
    transaction: Transaction,
  ): Promise<ChildDedicationRecord>;
  counts(
    scope: TenantScope,
    year: number,
  ): Promise<{ total: number; thisYear: number }>;
}

export interface NewMarriage {
  /** The lower person id: the database requires spouse1 < spouse2. */
  readonly spouse1Id: number;
  readonly spouse2Id: number;
  readonly marriedOn: string;
  readonly place: string;
  readonly registeredWith: MarriageRegistry;
  readonly officiantId: number | null;
}

export interface MarriageRepository {
  list(
    scope: TenantScope,
    filter: MarriageFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<MarriageRecord>>;
  find(scope: TenantScope, id: number): Promise<MarriageRecord | null>;
  hasActiveMarriage(
    scope: TenantScope,
    personIds: readonly number[],
    transaction: Transaction,
  ): Promise<boolean>;
  create(
    scope: TenantScope,
    data: NewMarriage,
    transaction: Transaction,
  ): Promise<MarriageRecord>;
  dissolve(
    scope: TenantScope,
    id: number,
    data: { endedOn: string; endReason: MarriageEndReason },
    transaction: Transaction,
  ): Promise<MarriageRecord>;
  counts(scope: TenantScope): Promise<{ active: number; dissolved: number }>;
}

export interface PastoralTermRepository {
  /** Sorted by sede, then most recent first. */
  list(
    scope: TenantScope,
    filter: PastoralTermFilter,
  ): Promise<PastoralTermRecord[]>;
  find(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<PastoralTermRecord | null>;
  /** Serializes the changes of the terms of one sede. */
  lockCongregation(
    scope: TenantScope,
    congregationId: number,
    transaction: Transaction,
  ): Promise<void>;
  periodsOf(
    scope: TenantScope,
    congregationId: number,
    transaction: Transaction,
  ): Promise<TermPeriod[]>;
  create(
    scope: TenantScope,
    data: {
      congregationId: number;
      pastorId: number;
      startedOn: string;
      endedOn: string | null;
    },
    transaction: Transaction,
  ): Promise<PastoralTermRecord>;
  setEndDate(
    scope: TenantScope,
    id: number,
    endedOn: string,
    transaction: Transaction,
  ): Promise<void>;
}
