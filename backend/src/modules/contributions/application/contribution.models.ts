import type { CategorySummary } from '../domain/contribution-rules.js';
import type {
  ContributionCategory,
  ContributionDisplayStatus,
  ContributionStatus,
  ContributionVoidBlock,
  PaymentMethod,
  PeriodStatus,
} from '../domain/contribution.types.js';

/** A contribution as the repository reads it: plain values, no Prisma types, nothing sensitive beyond names. */
export interface ContributionRecord {
  id: number;
  congregationId: number;
  congregationName: string;
  voucherId: number | null;
  /** Consecutive number of the REC voucher; null only for rows that predate vouchers. */
  receiptNumber: number | null;
  receivedOn: string;
  contributionTypeId: number;
  typeName: string;
  category: ContributionCategory;
  personId: number | null;
  /** Name and first surname. */
  contributorName: string | null;
  memberCode: string | null;
  vowPledgeId: number | null;
  /** Year of the promise, needed to compose the VOTO-AAAA-NNNN code. */
  vowPledgedOn: string | null;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  notes: string | null;
  amount: number;
  status: ContributionStatus;
  /** Part of an issued tithe settlement. */
  settled: boolean;
  /** Part of a cash-book consolidation. */
  consolidated: boolean;
  voidReason: string | null;
}

/** Extra data of the detail view. */
export interface ContributionDetailRecord extends ContributionRecord {
  recordedAt: string;
  recordedByName: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  /** Number of the CI voucher of the consolidation, when there is one. */
  consolidationNumber: number | null;
  consolidationIssuedOn: string | null;
  settlementId: number | null;
}

/** What the screens receive for one contribution of a list. */
export interface ContributionRow {
  id: number;
  /** REC-2026-01872. */
  receiptNumber: string;
  /** The receipt voucher, to download it as a PDF (`/accounting/vouchers/:id/pdf`); null for rows that predate vouchers. */
  voucherId: number | null;
  receivedOn: string;
  contributionTypeId: number;
  typeName: string;
  category: ContributionCategory;
  personId: number | null;
  /** Null for anonymous contributions and aggregated collections. */
  contributorName: string | null;
  memberCode: string | null;
  vowPledgeId: number | null;
  vowPledgeCode: string | null;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  /** Description of a collection or free note. */
  notes: string | null;
  amount: number;
  status: ContributionDisplayStatus;
  voidBlock: ContributionVoidBlock | null;
  voidReason: string | null;
  congregationName: string;
}

export interface ContributionDetail extends ContributionRow {
  recordedAt: string;
  recordedByName: string | null;
  voidedAt: string | null;
  voidedByName: string | null;
  /** CI-2026-00012 when the contribution is part of a cash-book consolidation. */
  consolidationVoucher: string | null;
  settlementId: number | null;
}

export interface ContributionListing {
  items: readonly ContributionRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Range the list covers (YYYY-MM-DD, both included). */
  from: string;
  to: string;
  /** "Noviembre 2026" for a month, or the range written out. */
  label: string;
  /** Status of the sede period when the list is one month of one sede; null otherwise. */
  periodStatus: PeriodStatus | null;
  summary: readonly CategorySummary[];
  /** Total of the valid (not voided) contributions of the filter. */
  totalAmount: number;
  voidedCount: number;
}

export interface ContributionTypeOption {
  id: number;
  name: string;
  category: ContributionCategory;
}

export interface PeriodOption {
  year: number;
  month: number;
  status: PeriodStatus;
  label: string;
}

export interface ContributionFormOptions {
  today: string;
  /** False when acting on "Toda la denominación": the view is read-only and aggregated. */
  congregationScoped: boolean;
  scopeLabel: string;
  types: readonly ContributionTypeOption[];
  /** Months with an accounting period, newest first. */
  periods: readonly PeriodOption[];
  /** First and last date that fall in an OPEN period, up to today. */
  minDate: string | null;
  maxDate: string | null;
  /** Ranges of the sede's issued tithe settlements: tithes cannot be recorded inside them. */
  settledTitheRanges: readonly { from: string; to: string }[];
  /** REC-2026-01873: the receipt the next contribution will get, or null when denomination-wide. */
  nextReceiptNumber: string | null;
}

export interface PersonOption {
  id: number;
  fullName: string;
  /** SC-0130 or '—'. */
  memberCode: string;
  congregationName: string;
  /** "CC ···1904": never the full document. */
  documentHint: string;
}
