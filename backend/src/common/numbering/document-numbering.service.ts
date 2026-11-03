import { Inject, Injectable } from '@nestjs/common';
import {
  TRANSACTION_RUNNER,
  type Transaction,
  type TransactionRunner,
} from '../persistence/transaction.js';
import { TenantScope } from '../tenancy/tenant-scope.js';
import {
  DOCUMENT_SEQUENCE_STORE,
  type DocumentSequenceStore,
} from './document-sequence.store.js';

/** Keys of DocumentSequence (at most 60 characters). Counters never restart: the year is only formatting. */
export const SequenceKeys = {
  member: 'MEMBER',
  voucher: (type: string) => `VOUCHER:${type}`,
  certificate: (typeCode: string) => `CERT:${typeCode}`,
} as const;

const KEY_PART = /^[A-Z0-9_]{1,30}$/;

function assertKeyPart(part: string): void {
  if (!KEY_PART.test(part)) {
    throw new Error('Invalid sequence key part');
  }
}

/** SC-0153 */
export function formatMemberCode(
  congregationCode: string,
  number: number,
): string {
  return `${congregationCode}-${String(number).padStart(4, '0')}`;
}

/** REC-2026-01872. The year comes from the date of the voucher, not from the counter. */
export function formatVoucherCode(
  type: string,
  date: string | Date,
  number: number,
): string {
  return `${type}-${yearOf(date)}-${String(number).padStart(5, '0')}`;
}

/** CERT-MEM-2026-0031 */
export function formatCertificateCode(
  typeCode: string,
  date: string | Date,
  number: number,
): string {
  return `CERT-${typeCode}-${yearOf(date)}-${String(number).padStart(4, '0')}`;
}

function yearOf(date: string | Date): string {
  return typeof date === 'string'
    ? date.slice(0, 4)
    : String(date.getUTCFullYear());
}

/**
 * Single entry point to number members, vouchers and certificates. The three kinds share one counter
 * table, one transaction rule and one set of keys, so numbers are gapless and never collide.
 *
 * Always call it inside the transaction that saves the numbered record: if that transaction rolls
 * back, the number is released with it.
 */
@Injectable()
export class DocumentNumberingService {
  constructor(
    @Inject(DOCUMENT_SEQUENCE_STORE)
    private readonly store: DocumentSequenceStore,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
  ) {}

  nextMemberNumber(scope: TenantScope, transaction?: Transaction) {
    return this.next(scope, SequenceKeys.member, transaction);
  }

  nextVoucherNumber(
    scope: TenantScope,
    type: string,
    transaction?: Transaction,
  ) {
    assertKeyPart(type);
    return this.next(scope, SequenceKeys.voucher(type), transaction);
  }

  nextCertificateNumber(
    scope: TenantScope,
    typeCode: string,
    transaction?: Transaction,
  ) {
    assertKeyPart(typeCode);
    return this.next(scope, SequenceKeys.certificate(typeCode), transaction);
  }

  private next(
    scope: TenantScope,
    key: string,
    transaction?: Transaction,
  ): Promise<number> {
    scope.requireCongregationId();
    return transaction
      ? this.store.next(scope, key, transaction)
      : this.transactions.run((own) => this.store.next(scope, key, own));
  }
}
