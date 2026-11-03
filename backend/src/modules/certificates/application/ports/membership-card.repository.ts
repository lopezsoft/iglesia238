import type { Page } from '../../../../common/pagination/page.js';
import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type {
  CardCandidateRecord,
  CardFilter,
  CardRecord,
  PageParams,
} from '../certificate.models.js';

export const MEMBERSHIP_CARD_REPOSITORY = Symbol('MEMBERSHIP_CARD_REPOSITORY');

export interface NewMembershipCard {
  readonly memberId: number;
  readonly memberNumber: number;
  readonly issuedOn: string;
  readonly expiresOn: string;
}

export interface CardCounts {
  readonly valid: number;
  readonly expiringSoon: number;
  readonly expired: number;
}

/** Persistence of membership cards, always limited by the TenantScope of the request. */
export interface MembershipCardRepository {
  list(
    scope: TenantScope,
    filter: CardFilter,
    paging: PageParams,
  ): Promise<Page<CardRecord>>;
  findById(scope: TenantScope, id: number): Promise<CardRecord | null>;
  /** All cards of the member in the denomination, whichever sede issued them. */
  findByMember(
    scope: TenantScope,
    memberId: number,
  ): Promise<readonly CardRecord[]>;
  /** Active members of the sede (with an open registry entry) that have no valid card there. */
  listCandidates(
    scope: TenantScope,
    query: { q?: string; today: string },
    paging: PageParams,
  ): Promise<Page<CardCandidateRecord>>;
  /** The card belongs to the congregation of the scope, which must be a congregation scope. */
  insert(
    scope: TenantScope,
    data: NewMembershipCard,
    transaction: Transaction,
  ): Promise<CardRecord>;
  /** False when the card was already voided or does not belong to the scope. */
  markVoided(
    scope: TenantScope,
    id: number,
    reason: string,
    at: Date,
    transaction: Transaction,
  ): Promise<boolean>;
  counts(
    scope: TenantScope,
    today: string,
    expiringBefore: string,
  ): Promise<CardCounts>;
}
