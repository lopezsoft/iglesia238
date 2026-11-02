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
  readonly receivedOn: string;
  readonly contributionTypeId: number;
  readonly typeName: string;
  readonly category: ContributionCategory;
  readonly personId: number | null;
  /** Null for anonymous contributions and aggregated collections. */
  readonly contributorName: string | null;
  /** Member code, "Abono a VOTO-…", the collection description or "Sin datos del aportante". */
  readonly contributorDetail: string;
  readonly vowPledgeId: number | null;
  readonly paymentMethod: PaymentMethod;
  readonly paymentReference: string | null;
  readonly amount: number;
  readonly status: ContributionDisplayStatus;
  /** Null when the contribution can be voided (or is already voided). */
  readonly voidBlock: ContributionVoidBlock | null;
  readonly voidReason: string | null;
  readonly congregationName: string;
}

export interface CategorySummary {
  readonly category: ContributionCategory;
  readonly amount: number;
  readonly count: number;
  /** Whole percentage of the month total. */
  readonly share: number;
}

export interface ContributionMonth {
  readonly year: number;
  readonly month: number;
  readonly label: string;
  /** Status of the sede period; null when denomination-wide or the period does not exist. */
  readonly periodStatus: PeriodStatus | null;
  /** Newest receipt first. */
  readonly rows: readonly ContributionRow[];
  readonly summary: readonly CategorySummary[];
  /** Total of the non-voided contributions. */
  readonly total: number;
  readonly voidedCount: number;
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
