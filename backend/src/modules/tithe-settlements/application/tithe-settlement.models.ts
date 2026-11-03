import type { PaymentMethod } from '../../../generated/prisma/enums.js';

export type TitheSettlementStatusValue = 'ISSUED' | 'VOIDED';
export type TitheComponentKey = 'NATIONAL' | 'LOCAL_FUND' | 'PASTOR';

export interface TitheRuleView {
  readonly id: number;
  readonly effectiveFrom: string;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
  /** The rule that applies today: the latest one that already started. */
  readonly inForce: boolean;
}

export interface TitheRangeView {
  readonly from: string;
  readonly to: string;
}

/** A tithe contribution as the settlement sees it. */
export interface TitheContributionData {
  readonly id: number;
  readonly receivedOn: string;
  readonly amount: number;
  readonly status: 'RECORDED' | 'VOIDED';
  readonly titheSettlementId: number | null;
  readonly personId: number | null;
  readonly contributorName: string | null;
  readonly memberCode: string | null;
  readonly paymentMethod: PaymentMethod;
  readonly receiptNumber: string | null;
}

export interface TitheContributionRow {
  readonly id: number;
  readonly receiptNumber: string | null;
  readonly receivedOn: string;
  /** Null for anonymous tithes. */
  readonly contributorName: string | null;
  /** Member code of the contributor; null when the person is not a member or the tithe is anonymous. */
  readonly memberCode: string | null;
  readonly paymentMethod: PaymentMethod;
  readonly amount: number;
}

/** Account and fund where a payable component is booked. */
export interface BookingTarget {
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundId: number;
  readonly fundName: string;
  readonly fundIsActive: boolean;
}

export interface BookingTargets {
  readonly nationalShare: BookingTarget | null;
  readonly pastorNet: BookingTarget | null;
  /** Name of the fund that keeps the local share, for the preview. */
  readonly localFundName: string | null;
}

export interface TitheComponentView {
  readonly key: TitheComponentKey;
  /** Share of the gross tithe (0-1). */
  readonly rate: number;
  readonly amount: number;
  /** Where the cash line is booked; null when the component generates no movement. */
  readonly booking: {
    readonly accountCode: string;
    readonly accountName: string;
    readonly fundName: string;
  } | null;
}

export interface TithePreview extends TitheRangeView {
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
  readonly components: readonly TitheComponentView[];
  /** Always equal to the gross. */
  readonly componentsTotal: number;
  /** Oldest first. */
  readonly contributions: readonly TitheContributionRow[];
  /** Estimate: the number is reserved when the settlement is confirmed. */
  readonly nextNumber: string;
}

/** Row of a settlement as the repository returns it, before the number is formatted. */
export interface SettlementRecord {
  readonly id: number;
  readonly voucherType: string | null;
  readonly voucherNumber: number | null;
  readonly voucherIssuedOn: string | null;
  readonly settledOn: string;
  readonly coveredFrom: string;
  readonly coveredTo: string;
  readonly grossTithe: number;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
  readonly nationalShare: number;
  readonly localFundShare: number;
  readonly pastorNet: number;
  readonly status: TitheSettlementStatusValue;
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
  readonly contributionCount: number;
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
  /** Tithes included; 0 once the settlement is voided (they were released). */
  readonly contributionCount: number;
  readonly status: TitheSettlementStatusValue;
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

export interface SettlementDetailData {
  readonly record: SettlementRecord;
  readonly congregationName: string;
  readonly voidedByName: string | null;
  readonly contributions: readonly TitheContributionData[];
  readonly cashLines: readonly SettlementCashLine[];
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
  /** Rule in force today; null when the denomination has none yet. */
  readonly rule: TitheRuleView | null;
  /** Range of the latest issued settlement, for the suggestion of the next range. */
  readonly lastIssued: TitheRangeView | null;
  readonly yearSummary: TitheYearSummary | null;
}

export interface SettlementListQuery {
  readonly status: TitheSettlementStatusValue | null;
  /** Settlement date bounds (inclusive). */
  readonly from: string | null;
  readonly to: string | null;
  readonly page: number;
  readonly pageSize: number;
}

/** Everything the writer stores for a new settlement. */
export interface NewSettlement {
  readonly userId: number;
  readonly voucherType: string;
  readonly voucherNumber: number;
  readonly settledOn: string;
  readonly periodId: number;
  readonly coveredFrom: string;
  readonly coveredTo: string;
  readonly grossTithe: number;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
  readonly nationalShare: number;
  readonly localFundShare: number;
  readonly pastorNet: number;
  readonly contributionIds: readonly number[];
  readonly cashLines: readonly NewCashLine[];
}

export interface NewCashLine {
  readonly accountId: number;
  readonly fundId: number;
  readonly amount: number;
  readonly description: string;
}

export interface VoidSettlementInput {
  readonly userId: number;
  readonly reason: string;
  readonly today: string;
  readonly periodId: number;
  readonly reversalDescription: string;
}

export interface VoidOutcome {
  readonly record: SettlementRecord;
  readonly releasedCount: number;
  readonly reversedCount: number;
}
