import {
  ContributionCategory,
  ContributionDisplayStatus,
  PaymentMethod,
  PeriodOption,
  PeriodStatus,
  PersonOption,
} from '../../data/accounting.models';

/**
 * Why a contribution cannot be voided: SETTLED (part of a tithe settlement) or CONSOLIDATED
 * (part of a cash-book consolidation, which must be reversed first).
 */
export type ContributionVoidBlock = 'SETTLED' | 'CONSOLIDATED';

export interface ContributionRow {
  readonly id: number;
  /** REC-2026-01872. */
  readonly receiptNumber: string;
  /** The receipt voucher: with it the receipt downloads as a PDF. Null for rows that predate vouchers. */
  readonly voucherId: number | null;
  readonly receivedOn: string;
  readonly contributionTypeId: number;
  readonly typeName: string;
  readonly category: ContributionCategory;
  readonly personId: number | null;
  /** Name and first surname; null for anonymous contributions and aggregated collections. */
  readonly contributorName: string | null;
  /** SC-0130 for a member, null otherwise. */
  readonly memberCode: string | null;
  readonly vowPledgeId: number | null;
  /** VOTO-2026-0014 when the contribution pays a pledge. */
  readonly vowPledgeCode: string | null;
  readonly paymentMethod: PaymentMethod;
  readonly paymentReference: string | null;
  /** Description of a collection or free note. */
  readonly notes: string | null;
  readonly amount: number;
  readonly status: ContributionDisplayStatus;
  /** Null when the contribution can be voided (or is already voided). */
  readonly voidBlock: ContributionVoidBlock | null;
  readonly voidReason: string | null;
  readonly congregationName: string;
}

/** Everything the detail drawer shows. */
export interface ContributionDetail extends ContributionRow {
  readonly recordedAt: string;
  readonly recordedByName: string | null;
  readonly voidedAt: string | null;
  readonly voidedByName: string | null;
  /** CI-2026-00012 when the contribution is part of a cash-book consolidation. */
  readonly consolidationVoucher: string | null;
  readonly settlementId: number | null;
}

export interface CategorySummary {
  readonly category: ContributionCategory;
  readonly amount: number;
  readonly count: number;
  /** Whole percentage of the total. */
  readonly share: number;
}

/** One page of contributions and the totals of the whole filter. */
export interface ContributionListing {
  readonly items: readonly ContributionRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly from: string;
  readonly to: string;
  /** "Noviembre 2026" or the written range. */
  readonly label: string;
  /** Status of the sede period when the list is one month of one sede; null otherwise. */
  readonly periodStatus: PeriodStatus | null;
  readonly summary: readonly CategorySummary[];
  /** Total of the non-voided contributions of the filter. */
  readonly totalAmount: number;
  readonly voidedCount: number;
}

/** Filters shared by the list and the export. Month or date range; the rest narrow the list. */
export interface ContributionFilters {
  readonly year?: number;
  readonly month?: number;
  readonly from?: string;
  readonly to?: string;
  readonly category?: ContributionCategory | null;
  readonly contributionTypeId?: number | null;
  readonly paymentMethod?: PaymentMethod | null;
  readonly status?: ContributionDisplayStatus | null;
  readonly search?: string | null;
}

export interface ContributionQuery extends ContributionFilters {
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

export interface ContributionTypeOption {
  readonly id: number;
  readonly name: string;
  readonly category: ContributionCategory;
}

export interface ContributionFormOptions {
  readonly today: string;
  /** False when acting on "Toda la denominación": the view is read-only and aggregated. */
  readonly congregationScoped: boolean;
  readonly scopeLabel: string;
  /** Active contribution types of the denomination. */
  readonly types: readonly ContributionTypeOption[];
  /** Months with an accounting period, newest first. */
  readonly periods: readonly PeriodOption[];
  /** First and last date that fall in an OPEN period, up to today. */
  readonly minDate: string | null;
  readonly maxDate: string | null;
  /** Ranges of the sede's issued tithe settlements: tithes cannot be recorded inside them. */
  readonly settledTitheRanges: readonly { readonly from: string; readonly to: string }[];
  /** Receipt number the next contribution will get, or null when denomination-wide. */
  readonly nextReceiptNumber: string | null;
}

export interface VowPledgeOption {
  readonly id: number;
  /** VOTO-2026-0014 · Ampliación del templo · saldo $ 450.000 */
  readonly label: string;
  readonly personId: number;
  readonly contributionTypeId: number;
  readonly balance: number;
}

/** What "Registrar abono" from Votos preselects in the form. */
export interface VowPaymentTarget {
  readonly pledge: VowPledgeOption;
  readonly person: PersonOption;
}

export interface RecordContributionCommand {
  readonly contributionTypeId: number;
  /** Null for anonymous contributions and aggregated collections. */
  readonly personId: number | null;
  readonly receivedOn: string;
  readonly amount: number;
  readonly paymentMethod: PaymentMethod;
  readonly paymentReference: string | null;
  readonly vowPledgeId: number | null;
  readonly notes: string | null;
}
