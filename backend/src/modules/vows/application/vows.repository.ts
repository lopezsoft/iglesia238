import type { Page } from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { ContributorCandidate } from '../../contributions/application/search-contributors.use-case.js';
import type { VowPledgeStatus } from '../domain/vow-pledge-rules.js';
import type {
  VowPledgeDetailRecord,
  VowPledgeFigures,
  VowPledgeRecord,
  VowTypeOption,
} from './vow-pledge.models.js';

export const VOWS_REPOSITORY = Symbol('VOWS_REPOSITORY');

export interface VowPledgeFilter {
  status?: VowPledgeStatus;
  contributionTypeId?: number;
  /** Name, member code, document start or VOTO-AAAA-NNNN. */
  search?: string;
  overdueOnly?: boolean;
  /** Today in Bogota, to evaluate `overdueOnly`. */
  today?: string;
}

export interface NewVowPledgeData {
  personId: number;
  contributionTypeId: number;
  pledgedAmount: number;
  pledgedOn: string;
  dueOn: string | null;
  description: string | null;
}

export interface VowPledgeChanges {
  pledgedAmount?: number;
  dueOn?: string | null;
  description?: string | null;
}

/** The pledge row, locked for the rest of the transaction. */
export interface LockedPledge {
  id: number;
  congregationId: number;
  pledgedAmount: number;
  dueOn: string | null;
  pledgedOn: string;
  status: VowPledgeStatus;
  paid: number;
}

export interface VowTypeInfo {
  id: number;
  category: string;
  isActive: boolean;
}

/** Everything Votos needs from the database. Every method takes the TenantScope of the request. */
export interface VowsRepository {
  congregationName(scope: TenantScope): Promise<string | null>;
  listVowTypes(scope: TenantScope): Promise<VowTypeOption[]>;
  findType(scope: TenantScope, typeId: number): Promise<VowTypeInfo | null>;
  personExists(scope: TenantScope, personId: number): Promise<boolean>;

  findPage(
    scope: TenantScope,
    filter: VowPledgeFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<VowPledgeRecord>>;
  findAll(
    scope: TenantScope,
    filter: VowPledgeFilter,
    limit: number,
  ): Promise<VowPledgeRecord[]>;
  statusCounts(scope: TenantScope): Promise<Record<VowPledgeStatus, number>>;
  listFigures(scope: TenantScope): Promise<VowPledgeFigures[]>;
  findById(
    scope: TenantScope,
    id: number,
  ): Promise<VowPledgeDetailRecord | null>;
  /** Pledges of the person and type (across the whole denomination) that are active. */
  findActive(
    scope: TenantScope,
    personId: number,
    contributionTypeId: number,
  ): Promise<VowPledgeRecord[]>;
  /** Person data for the payment target of a pledge (raw: the use case masks the document). */
  findContributor(
    scope: TenantScope,
    personId: number,
  ): Promise<ContributorCandidate | null>;

  create(
    scope: TenantScope,
    data: NewVowPledgeData,
    transaction: Transaction,
  ): Promise<number>;
  lock(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<LockedPledge | null>;
  /** ACTIVE to CANCELLED; false when the pledge was not ACTIVE any more. */
  cancel(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<boolean>;
  update(
    scope: TenantScope,
    id: number,
    changes: VowPledgeChanges,
    transaction: Transaction,
  ): Promise<void>;
  refreshStatus(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<VowPledgeStatus>;
}
