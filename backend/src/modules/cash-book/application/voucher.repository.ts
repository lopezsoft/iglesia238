import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';

export const VOUCHER_READ_REPOSITORY = Symbol('VOUCHER_READ_REPOSITORY');

export interface VoucherFilter {
  /** Only these types (already limited to what the user may read). */
  readonly types: readonly string[];
  readonly from?: string;
  readonly to?: string;
  readonly voided?: boolean;
  readonly number?: number;
  readonly skip: number;
  readonly take: number;
}

export interface VoucherRecord {
  readonly id: number;
  readonly type: string;
  readonly number: number;
  readonly issuedOn: string;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
  /** Totals of what hangs from the voucher. */
  readonly linesAmount: number;
  readonly linesCount: number;
  readonly contributionsAmount: number;
  readonly contributionsCount: number;
  readonly settlementGross: number | null;
}

export interface VoucherLineRecord {
  readonly id: number;
  readonly postedOn: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly fundName: string;
  readonly direction: 'IN' | 'OUT';
  readonly amount: number;
  readonly description: string;
  readonly isReversal: boolean;
}

export interface VoucherContributionRecord {
  readonly id: number;
  readonly receivedOn: string;
  readonly typeName: string;
  readonly amount: number;
  readonly status: 'RECORDED' | 'VOIDED';
  /** Who gave it; null for an anonymous contribution. Printed on the receipt, never listed in the JSON detail. */
  readonly contributorName: string | null;
  readonly paymentMethod: string;
}

/** Whose book the voucher belongs to: the heading of the printed document. */
export interface VoucherLetterhead {
  readonly denominationName: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly congregationName: string;
}

export interface VoucherDetailRecord extends VoucherRecord {
  readonly letterhead: VoucherLetterhead;
  readonly lines: readonly VoucherLineRecord[];
  readonly contributions: readonly VoucherContributionRecord[];
}

/** Read side of the vouchers of one congregation. */
export interface VoucherReadRepository {
  list(
    scope: TenantScope,
    filter: VoucherFilter,
  ): Promise<{ rows: VoucherRecord[]; total: number }>;
  find(scope: TenantScope, id: number): Promise<VoucherDetailRecord | null>;
}
