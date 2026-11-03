import type { Transaction } from '../../../common/persistence/transaction.js';
import type { Page } from '../../../common/pagination/page.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type {
  ContributionCategory,
  ContributionDisplayStatus,
  PaymentMethod,
  PeriodStatus,
} from '../domain/contribution.types.js';
import type { CategoryTotal } from '../domain/contribution-rules.js';
import type { VowPledgeStatus } from '../../vows/domain/vow-pledge-rules.js';
import type {
  ContributionDetailRecord,
  ContributionRecord,
  ContributionTypeOption,
} from './contribution.models.js';

export const CONTRIBUTIONS_REPOSITORY = Symbol('CONTRIBUTIONS_REPOSITORY');

/** Filter of the list, the summary and the export. Dates are YYYY-MM-DD and both ends are included. */
export interface ContributionFilter {
  from: string;
  to: string;
  category?: ContributionCategory;
  contributionTypeId?: number;
  paymentMethod?: PaymentMethod;
  status?: ContributionDisplayStatus;
  search?: string;
}

export interface PeriodSummary {
  year: number;
  month: number;
  status: PeriodStatus;
}

/** A contribution type seen from the point of view of recording a contribution. */
export interface ContributionTypeInfo {
  id: number;
  name: string;
  category: ContributionCategory;
  isActive: boolean;
  /** Its income account exists, is active and accepts movements. */
  accountUsable: boolean;
}

/** A vow pledge locked inside the transaction that records or voids a payment. */
export interface LockedVowPledge {
  id: number;
  personId: number;
  contributionTypeId: number;
  pledgedAmount: number;
  status: VowPledgeStatus;
  /** Sum of the contributions that are not voided. */
  paid: number;
}

export interface NewVoucherData {
  type: string;
  number: number;
  issuedOn: string;
}

export interface NewContributionData {
  contributionTypeId: number;
  personId: number | null;
  vowPledgeId: number | null;
  voucherId: number;
  receivedOn: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  notes: string | null;
  recordedById: number;
}

export interface CategoryBreakdown {
  /** Valid contributions per category. */
  totals: readonly CategoryTotal[];
  voidedCount: number;
}

/** Everything Aportes needs from the database. Every method takes the TenantScope of the request. */
export interface ContributionsRepository {
  congregationName(scope: TenantScope): Promise<string | null>;
  listActiveTypes(scope: TenantScope): Promise<ContributionTypeOption[]>;
  findType(
    scope: TenantScope,
    typeId: number,
  ): Promise<ContributionTypeInfo | null>;
  /** Periods of the scope (every congregation of the denomination when it has none). */
  listPeriods(scope: TenantScope): Promise<PeriodSummary[]>;
  findPeriod(
    scope: TenantScope,
    year: number,
    month: number,
  ): Promise<PeriodSummary | null>;
  /** Covered ranges of the ISSUED tithe settlements of the sede. */
  listIssuedTitheRanges(
    scope: TenantScope,
  ): Promise<{ from: string; to: string }[]>;
  /** Number the next REC voucher of the sede will get; reads, does not reserve. */
  peekNextReceiptNumber(scope: TenantScope): Promise<number>;
  /** The person is registered in the denomination (and not deleted). */
  personExists(scope: TenantScope, personId: number): Promise<boolean>;

  findPage(
    scope: TenantScope,
    filter: ContributionFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<ContributionRecord>>;
  breakdown(
    scope: TenantScope,
    filter: ContributionFilter,
  ): Promise<CategoryBreakdown>;
  findAll(
    scope: TenantScope,
    filter: ContributionFilter,
    limit: number,
  ): Promise<ContributionRecord[]>;
  findById(
    scope: TenantScope,
    id: number,
  ): Promise<ContributionDetailRecord | null>;

  /** `SELECT ... FOR UPDATE` on the pledge of the denomination; null when it does not exist there. */
  lockVowPledge(
    scope: TenantScope,
    pledgeId: number,
    transaction: Transaction,
  ): Promise<LockedVowPledge | null>;
  createVoucher(
    scope: TenantScope,
    data: NewVoucherData,
    transaction: Transaction,
  ): Promise<number>;
  createContribution(
    scope: TenantScope,
    data: NewContributionData,
    transaction: Transaction,
  ): Promise<number>;
  /**
   * Voids the contribution only if it is still recorded, not settled and not consolidated.
   * Returns false when the state changed in the meantime.
   */
  markVoided(
    scope: TenantScope,
    id: number,
    voidedById: number,
    reason: string,
    transaction: Transaction,
  ): Promise<boolean>;
  voidVoucher(
    scope: TenantScope,
    voucherId: number,
    reason: string,
    transaction: Transaction,
  ): Promise<void>;
  /** Recomputes and stores the status of the pledge from its valid payments. */
  refreshVowPledgeStatus(
    scope: TenantScope,
    pledgeId: number,
    transaction: Transaction,
  ): Promise<VowPledgeStatus>;
}
