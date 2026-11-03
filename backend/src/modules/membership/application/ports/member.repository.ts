import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type {
  MemberDetail,
  MemberListCriteria,
  MemberListPaging,
  MemberListResult,
  MemberListRow,
  MemberReference,
  MembershipDataPatch,
  MemberStatus,
  NewMemberRecord,
} from '../member.models.js';

export const MEMBER_REPOSITORY = Symbol('MEMBER_REPOSITORY');

/**
 * Persistence of members. Every method takes the TenantScope of the caller: a member outside it
 * does not exist as far as the repository is concerned.
 */
export interface MemberRepository {
  list(
    scope: TenantScope,
    criteria: MemberListCriteria,
    paging: MemberListPaging,
  ): Promise<MemberListResult>;

  /** Same filters as `list`, without paging and capped at `limit` rows. */
  listForExport(
    scope: TenantScope,
    criteria: MemberListCriteria,
    limit: number,
  ): Promise<MemberListRow[]>;

  findDetail(
    scope: TenantScope,
    memberId: number,
    transaction?: Transaction,
  ): Promise<MemberDetail | null>;

  findReference(
    scope: TenantScope,
    memberId: number,
    transaction?: Transaction,
  ): Promise<MemberReference | null>;

  insert(
    scope: TenantScope,
    record: NewMemberRecord,
    transaction: Transaction,
  ): Promise<number>;

  updateMembershipData(
    scope: TenantScope,
    memberId: number,
    patch: MembershipDataPatch,
    transaction: Transaction,
  ): Promise<void>;

  updateStatus(
    scope: TenantScope,
    memberId: number,
    status: MemberStatus,
    transaction: Transaction,
  ): Promise<void>;

  updateCongregation(
    scope: TenantScope,
    memberId: number,
    congregationId: number,
    transaction: Transaction,
  ): Promise<void>;

  updatePastoralRank(
    scope: TenantScope,
    memberId: number,
    pastoralRankId: number | null,
    transaction: Transaction,
  ): Promise<void>;

  /** Clears the free-text fields of a member (pastor notes, desired areas). */
  clearNotes(
    scope: TenantScope,
    memberId: number,
    transaction: Transaction,
  ): Promise<void>;
}
