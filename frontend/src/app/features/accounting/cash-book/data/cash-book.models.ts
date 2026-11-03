import { AccountNature, CashDirection, PeriodStatus } from '../../data/accounting.models';

export interface CashFundOption {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

export interface CashPeriodOption {
  readonly id: number;
  readonly year: number;
  readonly month: number;
  readonly status: PeriodStatus;
  /** "Noviembre 2026". */
  readonly label: string;
  readonly closedAt: string | null;
  /** First and last day ('YYYY-MM-DD'). */
  readonly from: string;
  readonly to: string;
}

export interface CashAccountOption {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly nature: AccountNature;
}

/** Catalogs of the cash book of the active sede. */
export interface CashBookOptions {
  readonly today: string;
  /** Null when the scope is the whole denomination (the cash book belongs to one sede). */
  readonly congregationId: number | null;
  readonly congregationName: string;
  readonly funds: readonly CashFundOption[];
  /** Newest first. */
  readonly periods: readonly CashPeriodOption[];
  /** Active postable accounts of the denomination, ordered by code. */
  readonly accounts: readonly CashAccountOption[];
}

export interface CashBookQuery {
  readonly fundId: number;
  readonly periodId: number;
  /** 1-based page of lines; the server pages the book. */
  readonly page?: number;
  readonly pageSize?: number;
  /** Filters on the lines; the running balance stays the true balance of the fund. */
  readonly direction?: CashDirection;
  readonly accountId?: number;
  readonly search?: string;
}

/** POSTED: a regular line; REVERSED: a line with a reversal; REVERSAL: the reversal itself. */
export type CashRowStatus = 'POSTED' | 'REVERSED' | 'REVERSAL';

/**
 * Why a line cannot be reversed from the cash book (null when it can).
 * CONSOLIDATION_PERIOD_CLOSED: the line consolidates contributions of a closed period, which
 * could never be consolidated again once released.
 */
export type ReversalBlock =
  | 'IS_REVERSAL'
  | 'ALREADY_REVERSED'
  | 'CONTRIBUTION'
  | 'TITHE_SETTLEMENT'
  | 'CONSOLIDATION_PERIOD_CLOSED';

export interface CashBookRow {
  readonly id: number;
  readonly postedOn: string;
  /** CI-2026-00012, CE-2026-00045, REC-…, or '—'. */
  readonly voucherCode: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly description: string;
  readonly direction: CashDirection;
  readonly amount: number;
  /** Running balance after the line, in posting order. */
  readonly balance: number;
  readonly status: CashRowStatus;
  /** Voucher of the original line (on a reversal) or of its reversal (on a reversed line). */
  readonly relatedVoucherCode: string | null;
  readonly reversalBlock: ReversalBlock | null;
}

export interface PendingConsolidation {
  readonly date: string;
  readonly count: number;
  readonly amount: number;
}

export interface CashBookView {
  readonly fundId: number;
  readonly fundName: string;
  readonly fundIsActive: boolean;
  readonly period: CashPeriodOption;
  readonly opening: number;
  readonly income: number;
  readonly expense: number;
  readonly closing: number;
  readonly inCount: number;
  readonly outCount: number;
  /** The requested page of lines, in posting order (date, then registration). */
  readonly rows: readonly CashBookRow[];
  /** Lines that match the filters (the pagination total). */
  readonly totalRows: number;
  readonly page: number;
  readonly pageSize: number;
  /** Contributions of today in this fund still pending consolidation. */
  readonly pendingToday: PendingConsolidation;
  /** Null when the period can be closed. */
  readonly closeBlockedReason: string | null;
  /** Next voucher numbers, for the preview in the dialogs. */
  readonly nextCashIn: string;
  readonly nextCashOut: string;
  /** Dates that fall in an OPEN period of the sede, up to today (null when there is none). */
  readonly openRange: { readonly min: string; readonly max: string } | null;
}

export interface RecordCashTransactionCommand {
  readonly fundId: number;
  readonly direction: CashDirection;
  readonly accountId: number;
  readonly postedOn: string;
  readonly amount: number;
  readonly description: string;
}

export interface ReverseCashTransactionCommand {
  readonly transactionId: number;
  readonly postedOn: string;
  readonly reason: string;
}

/** Result of posting or reversing a line. */
export interface CashMovementReceipt {
  readonly transactionId: number;
  readonly voucherCode: string;
  readonly direction: CashDirection;
  readonly amount: number;
}

export interface ConsolidationGroup {
  readonly accountId: number;
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundId: number;
  readonly fundName: string;
  readonly count: number;
  readonly amount: number;
}

export interface ConsolidationPreview {
  readonly date: string;
  readonly groups: readonly ConsolidationGroup[];
  readonly count: number;
  readonly total: number;
  readonly nextVoucherCode: string;
}

export interface ConsolidationResult {
  readonly voucherCode: string;
  readonly movements: number;
  readonly count: number;
  readonly total: number;
}

export const CASH_ROW_STATUS_LABELS: Readonly<Record<CashRowStatus, string>> = {
  POSTED: 'Registrado',
  REVERSED: 'Reversado',
  REVERSAL: 'Reversa',
};

export const REVERSAL_BLOCK_LABELS: Readonly<Record<ReversalBlock, string>> = {
  IS_REVERSAL: 'Es una reversa',
  ALREADY_REVERSED: 'Ya reversado',
  CONTRIBUTION: 'Se anula en Aportes',
  TITHE_SETTLEMENT: 'Se anula en Liquidación',
  CONSOLIDATION_PERIOD_CLOSED: 'Aportes de un periodo cerrado',
};

// ---------------------------------------------------------------------------------------------
// Vouchers (comprobantes)

export type VoucherKind = 'REC' | 'CI' | 'CE' | 'LD';

export const VOUCHER_KIND_LABELS: Readonly<Record<VoucherKind, string>> = {
  REC: 'Recibo de aporte',
  CI: 'Comprobante de ingreso',
  CE: 'Comprobante de egreso',
  LD: 'Liquidación del diezmo',
};

export interface VoucherQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly type?: VoucherKind;
  readonly from?: string;
  readonly to?: string;
  readonly status?: 'ISSUED' | 'VOIDED';
  /** Consecutive number of the voucher. */
  readonly number?: number;
}

export interface VoucherListItem {
  readonly id: number;
  /** REC-2026-01872, CI-2026-00012… */
  readonly code: string;
  readonly type: VoucherKind;
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

export interface VoucherLine {
  readonly id: number;
  readonly postedOn: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundName: string;
  readonly direction: CashDirection;
  readonly amount: number;
  readonly description: string;
  readonly isReversal: boolean;
}

export interface VoucherContribution {
  readonly id: number;
  readonly receivedOn: string;
  readonly typeName: string;
  readonly amount: number;
  readonly status: 'RECORDED' | 'VOIDED';
}

export interface VoucherDetail extends VoucherListItem {
  readonly lines: readonly VoucherLine[];
  readonly contributionRows: readonly VoucherContribution[];
}
