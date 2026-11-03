import { PaymentMethod, TitheSettlementStatus } from '../../data/accounting.models';

export type TitheComponentKey = 'NATIONAL' | 'LOCAL_FUND' | 'PASTOR';

/** Percentages of the denomination by validity date (they are entered in the accounting setup). */
export interface TitheRuleView {
  readonly id: number;
  readonly effectiveFrom: string;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
  /** The one that applies today. */
  readonly inForce: boolean;
}

export interface TitheRange {
  readonly from: string;
  readonly to: string;
}

/** Account and fund where the cash line of a component is booked. */
export interface TitheBooking {
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundName: string;
}

/** One destination of the gross tithe; `rate` is the effective share of the gross (0–1). */
export interface TitheComponent {
  readonly key: TitheComponentKey;
  readonly rate: number;
  readonly amount: number;
  /** Null when the component generates no cash movement. */
  readonly booking: TitheBooking | null;
}

export interface TitheContributionRow {
  readonly id: number;
  readonly receiptNumber: string | null;
  readonly receivedOn: string;
  /** Null for anonymous tithes. */
  readonly contributorName: string | null;
  readonly memberCode: string | null;
  readonly paymentMethod: PaymentMethod;
  readonly amount: number;
}

/** Draft computed by "Calcular": nothing is stored until it is confirmed. */
export interface TithePreview extends TitheRange {
  readonly congregationName: string;
  readonly denominationName: string;
  readonly localFundName: string | null;
  readonly count: number;
  readonly contributorCount: number;
  readonly anonymousCount: number;
  /** Voided tithes of the range, excluded from the gross. */
  readonly excludedCount: number;
  readonly grossTithe: number;
  readonly rule: TitheRuleView;
  readonly components: readonly TitheComponent[];
  /** Always equal to the gross (the rounding remainder goes to the largest component). */
  readonly componentsTotal: number;
  /** Oldest first. */
  readonly contributions: readonly TitheContributionRow[];
  /** Estimate: the number is reserved when the settlement is confirmed. */
  readonly nextNumber: string;
}

export interface TitheSettlementRow {
  readonly id: number;
  /** LD-2026-00001. */
  readonly number: string;
  readonly coveredFrom: string;
  readonly coveredTo: string;
  readonly settledOn: string;
  readonly grossTithe: number;
  readonly nationalShare: number;
  readonly localFundShare: number;
  readonly pastorNet: number;
  /** Percentages copied when the settlement was issued. */
  readonly nationalShareRate: number;
  readonly localFundRate: number;
  readonly contributionCount: number;
  readonly status: TitheSettlementStatus;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
}

export interface SettlementCashLine {
  readonly id: number;
  readonly postedOn: string;
  readonly direction: 'IN' | 'OUT';
  readonly amount: number;
  readonly description: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundName: string;
  readonly isReversal: boolean;
}

export interface TitheSettlementDetail extends TitheSettlementRow {
  readonly congregationName: string;
  readonly voidedByName: string | null;
  readonly contributions: readonly TitheContributionRow[];
  readonly cashLines: readonly SettlementCashLine[];
}

export interface TitheYearSummary {
  readonly year: number;
  readonly issuedCount: number;
  readonly grossTithe: number;
  readonly nationalShare: number;
  readonly localFundShare: number;
  readonly pastorNet: number;
}

export interface TitheOverview {
  readonly today: string;
  /** False when acting on the whole denomination: settlements belong to one sede. */
  readonly congregationScoped: boolean;
  readonly congregationName: string;
  /** Rule in force today (null when the denomination has none). */
  readonly rule: TitheRuleView | null;
  /** Range of the latest issued settlement, for the help text and the suggestion. */
  readonly lastIssued: TitheRange | null;
  readonly yearSummary: TitheYearSummary | null;
}

export interface SettlementQuery {
  readonly status: TitheSettlementStatus | null;
  /** Settlement date bounds, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
  readonly page: number;
  readonly pageSize: number;
}

/** The prototype calls an issued settlement "Confirmada". */
export const SETTLEMENT_STATUS_LABELS: Readonly<Record<TitheSettlementStatus, string>> = {
  ISSUED: 'Confirmada',
  VOIDED: 'Anulada',
};
