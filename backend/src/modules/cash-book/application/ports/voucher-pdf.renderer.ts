import type { VoucherLetterhead } from '../voucher.repository.js';

export const VOUCHER_PDF_RENDERER = Symbol('VOUCHER_PDF_RENDERER');

export interface VoucherPdfLine {
  readonly description: string;
  /** "410505 · Diezmos". */
  readonly accountLabel: string;
  readonly fundName: string;
  readonly direction: 'IN' | 'OUT';
  readonly amount: number;
}

export interface VoucherPdfContribution {
  readonly receivedOn: string;
  readonly typeName: string;
  readonly contributorName: string | null;
  readonly paymentMethodLabel: string;
  readonly amount: number;
}

export interface VoucherPdfInput {
  /** REC-2026-00031. */
  readonly code: string;
  /** "Recibo de aporte". */
  readonly title: string;
  readonly issuedOn: string;
  readonly letterhead: VoucherLetterhead;
  readonly total: number;
  readonly voided: boolean;
  readonly voidReason: string | null;
  readonly lines: readonly VoucherPdfLine[];
  readonly contributions: readonly VoucherPdfContribution[];
}

/** Renders a voucher as a printable document. The adapter decides the library. */
export interface VoucherPdfRenderer {
  render(input: VoucherPdfInput): Promise<Buffer>;
}
