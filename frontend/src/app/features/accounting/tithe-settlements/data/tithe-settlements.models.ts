import { PaymentMethod, TitheSettlementStatus } from '../../data/accounting.models';

export type TitheComponentKey = 'NATIONAL' | 'LOCAL_FUND' | 'PASTOR';

/** One destination of the gross tithe; `rate` is the effective share of the gross (0–1). */
export interface TitheComponent {
  readonly key: TitheComponentKey;
  readonly name: string;
  readonly target: string;
  readonly rate: number;
  /** "10 %", "30 % del neto (27 % del bruto)". */
  readonly rateLabel: string;
  readonly amount: number;
}

export interface TitheContributionRow {
  readonly id: number;
  readonly receiptNumber: string;
  readonly receivedOn: string;
  /** Null for anonymous tithes. */
  readonly contributorName: string | null;
  /** Member code or "Sin documento". */
  readonly contributorDetail: string;
  readonly paymentMethod: PaymentMethod;
  readonly amount: number;
}

export interface TitheRuleView {
  readonly effectiveFrom: string;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
}

export interface TitheRange {
  readonly from: string;
  readonly to: string;
}

/** Draft computed by "Calcular": nothing is stored until it is confirmed. */
export interface TithePreview extends TitheRange {
  readonly congregationName: string;
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
  readonly contributionCount: number;
  readonly status: TitheSettlementStatus;
  readonly voidReason: string | null;
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
  /** Newest first. */
  readonly settlements: readonly TitheSettlementRow[];
}

/** The prototype calls an issued settlement "Confirmada". */
export const SETTLEMENT_STATUS_LABELS: Readonly<Record<TitheSettlementStatus, string>> = {
  ISSUED: 'Confirmada',
  VOIDED: 'Anulada',
};
