import { Inject, Injectable } from '@nestjs/common';
import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  VOUCHER_PDF_RENDERER,
  type VoucherPdfRenderer,
} from './ports/voucher-pdf.renderer.js';
import { VouchersService, voucherTypeLabel } from './vouchers.service.js';

export interface VoucherDocument {
  readonly filename: string;
  readonly content: Buffer;
}

const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  BANK_DEPOSIT: 'Consignación',
  OTHER: 'Otro',
};

/**
 * The printable receipt or voucher. It goes through `VouchersService.getRecord`, so the sede, the
 * denomination and the permission of each voucher type are checked exactly as for the on-screen detail.
 */
@Injectable()
export class VoucherDocumentService {
  constructor(
    private readonly vouchers: VouchersService,
    @Inject(VOUCHER_PDF_RENDERER) private readonly renderer: VoucherPdfRenderer,
  ) {}

  async render(
    tenant: TenantContext,
    id: number,
    congregationId?: number,
  ): Promise<VoucherDocument> {
    const record = await this.vouchers.getRecord(tenant, id, congregationId);
    const code = formatVoucherCode(record.type, record.issuedOn, record.number);
    const total =
      record.linesCount > 0
        ? record.linesAmount
        : record.contributionsCount > 0
          ? record.contributionsAmount
          : (record.settlementGross ?? 0);

    // A voided voucher still prints, stamped, so the paper copy cannot pass for a valid one.
    const content = await this.renderer.render({
      code,
      title: voucherTypeLabel(record.type),
      issuedOn: record.issuedOn,
      letterhead: record.letterhead,
      total: fromCents(toCents(total)),
      voided: record.voidedAt !== null,
      voidReason: record.voidReason,
      lines: record.lines.map((line) => ({
        description: line.description,
        accountLabel: `${line.accountCode} · ${line.accountName}`,
        fundName: line.fundName,
        direction: line.direction,
        amount: line.amount,
      })),
      contributions: record.contributions.map((contribution) => ({
        receivedOn: contribution.receivedOn,
        typeName: contribution.typeName,
        contributorName: contribution.contributorName,
        paymentMethodLabel:
          PAYMENT_METHOD_LABELS[contribution.paymentMethod] ??
          contribution.paymentMethod,
        amount: contribution.amount,
      })),
    });
    return { filename: `${code}.pdf`, content };
  }
}
