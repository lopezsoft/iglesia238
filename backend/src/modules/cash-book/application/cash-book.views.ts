import type { PeriodView } from '../../../common/accounting/period-view.js';
import type { ReversalBlock } from './cash-book-rules.js';

export type DirectionValue = 'IN' | 'OUT';

export interface CashFundOptionView {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface CashAccountOptionView {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly nature: 'INCOME' | 'EXPENSE';
}

export interface CashBookOptionsView {
  readonly today: string;
  /** Null when the scope is the whole denomination (the cash book belongs to one sede). */
  readonly congregationId: number | null;
  readonly congregationName: string;
  readonly funds: readonly CashFundOptionView[];
  /** Newest first; empty without a sede. */
  readonly periods: readonly PeriodView[];
  readonly accounts: readonly CashAccountOptionView[];
}

/** POSTED: a regular line; REVERSED: a line with a reversal; REVERSAL: the reversal itself. */
export type CashRowStatus = 'POSTED' | 'REVERSED' | 'REVERSAL';

export interface CashBookRowView {
  readonly id: number;
  readonly postedOn: string;
  /** CI-2026-00012, CE-2026-00045, or '—'. */
  readonly voucherCode: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly description: string;
  readonly direction: DirectionValue;
  readonly amount: number;
  /** Running balance of the fund after the line, in posting order. */
  readonly balance: number;
  readonly status: CashRowStatus;
  readonly relatedVoucherCode: string | null;
  readonly reversalBlock: ReversalBlock | null;
}

export interface PendingConsolidationView {
  readonly date: string;
  readonly count: number;
  readonly amount: number;
}

export interface CashBookViewResult {
  readonly fundId: number;
  readonly fundName: string;
  readonly fundIsActive: boolean;
  readonly period: PeriodView;
  readonly opening: number;
  readonly income: number;
  readonly expense: number;
  readonly closing: number;
  /** Lines of the whole month, whatever the filters. */
  readonly inCount: number;
  readonly outCount: number;
  /** The requested page of lines, in posting order. */
  readonly rows: readonly CashBookRowView[];
  /** Lines that match the filters (the pagination total). */
  readonly totalRows: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pendingToday: PendingConsolidationView;
  /** Null when the period can be closed. */
  readonly closeBlockedReason: string | null;
  readonly nextCashIn: string;
  readonly nextCashOut: string;
  readonly openRange: { readonly min: string; readonly max: string } | null;
}

export interface CashMovementReceiptView {
  readonly transactionId: number;
  readonly voucherCode: string;
  readonly direction: DirectionValue;
  readonly amount: number;
}

export interface ConsolidationGroupView {
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundId: number;
  readonly fundName: string;
  readonly count: number;
  readonly amount: number;
}

export interface ConsolidationPreviewView {
  readonly date: string;
  readonly groups: readonly ConsolidationGroupView[];
  readonly count: number;
  readonly total: number;
  readonly nextVoucherCode: string;
}

export interface ConsolidationResultView {
  readonly voucherCode: string;
  readonly movements: number;
  readonly count: number;
  readonly total: number;
}

export interface VoucherListItemView {
  readonly id: number;
  readonly code: string;
  readonly type: string;
  readonly typeLabel: string;
  readonly number: number;
  readonly issuedOn: string;
  /** Sum of its cash lines, or of its contributions when it has no lines. */
  readonly amount: number;
  readonly status: 'ISSUED' | 'VOIDED';
  readonly voidReason: string | null;
  readonly movements: number;
  readonly contributions: number;
}

export interface VoucherLineView {
  readonly id: number;
  readonly postedOn: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundName: string;
  readonly direction: DirectionValue;
  readonly amount: number;
  readonly description: string;
  readonly isReversal: boolean;
}

export interface VoucherContributionView {
  readonly id: number;
  readonly receivedOn: string;
  readonly typeName: string;
  readonly amount: number;
  readonly status: 'RECORDED' | 'VOIDED';
}

export interface VoucherDetailView extends VoucherListItemView {
  readonly lines: readonly VoucherLineView[];
  readonly contributionRows: readonly VoucherContributionView[];
}
