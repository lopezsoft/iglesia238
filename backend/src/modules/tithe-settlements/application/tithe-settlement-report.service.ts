import { Injectable } from '@nestjs/common';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  fileSlug,
  formatLongDate,
  formatMoney,
  formatPercent,
  formatShortDate,
} from '../../../common/reports/report-format.js';
import { ReportIssuer } from '../../../common/reports/report-issuer.js';
import type { ReportRow } from '../../../common/reports/report-pdf.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { bogotaDateOf } from '../../../common/time/bogota-time.js';
import { GetTitheSettlementUseCase } from './list-tithe-settlements.use-case.js';
import type {
  SettlementCashLine,
  TitheContributionRow,
  TitheSettlementDetail,
} from './tithe-settlement.models.js';

const PAYMENT_METHOD_LABELS: Readonly<Record<string, string>> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Datáfono',
  BANK_DEPOSIT: 'Consignación',
  OTHER: 'Otro',
};

/** The share of the pastor is what the two percentages leave; rounded so 0.7 does not print as 0.69999. */
function pastorRate(detail: TitheSettlementDetail): number {
  return (
    Math.round((1 - detail.nationalShareRate - detail.localFundRate) * 10_000) /
    10_000
  );
}

function contributionRow(row: TitheContributionRow): ReportRow {
  return {
    cells: [
      row.receiptNumber ?? '—',
      formatShortDate(row.receivedOn),
      row.contributorName ?? 'Anónimo',
      row.memberCode ?? '—',
      PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod,
      formatMoney(row.amount),
    ],
  };
}

/** What each cash line says: where the money of the settlement went, or that it was reversed. */
function cashLineNote(line: SettlementCashLine): string {
  const target = `${line.accountCode} · ${line.accountName}, fondo ${line.fundName}`;
  const verb = line.direction === 'OUT' ? 'Egreso' : 'Ingreso';
  const reversal = line.isReversal ? ' (reversa por anulación)' : '';
  return `${verb} de caja${reversal}: ${line.description}, ${formatMoney(line.amount)} (${target}).`;
}

/**
 * The record of a tithe settlement (LD) as a document to sign and file: who settled, the period, the tithes included,
 * how the gross was split and where the cash movements were booked. A voided settlement prints too, marked as voided,
 * because it still exists in the books.
 */
@Injectable()
export class TitheSettlementReportService {
  constructor(
    private readonly settlements: GetTitheSettlementUseCase,
    private readonly issuer: ReportIssuer,
  ) {}

  async pdf(
    tenant: TenantContext,
    id: number,
  ): Promise<{ filename: string; content: Buffer }> {
    const detail = await this.settlements.execute(tenant, id);
    const scope = requireCongregationScope(
      tenant,
      'imprimir el acta de liquidación',
    );
    const voided = detail.status === 'VOIDED';
    const rows = detail.contributions.map(contributionRow);
    const content = await this.issuer.pdf(scope, {
      title: 'Acta de liquidación de diezmos',
      subtitle: `${detail.number} · Del ${formatShortDate(detail.coveredFrom)} al ${formatShortDate(detail.coveredTo)}${voided ? ' · ANULADA' : ''}`,
      orientation: 'portrait',
      summary: [
        { label: 'Diezmo bruto', value: formatMoney(detail.grossTithe) },
        {
          label: `Cuota nacional (${formatPercent(detail.nationalShareRate)})`,
          value: formatMoney(detail.nationalShare),
        },
        {
          label: `Fondo local (${formatPercent(detail.localFundRate)})`,
          value: formatMoney(detail.localFundShare),
        },
        {
          label: `Neto del pastor (${formatPercent(pastorRate(detail))})`,
          value: formatMoney(detail.pastorNet),
        },
      ],
      columns: [
        { header: 'Recibo', weight: 1.5 },
        { header: 'Fecha', weight: 1.2 },
        { header: 'Aportante', weight: 3 },
        { header: 'Carné', weight: 1.2 },
        { header: 'Forma de pago', weight: 1.5 },
        { header: 'Valor', weight: 1.4, align: 'right' },
      ],
      rows,
      totals:
        rows.length > 0
          ? [
              '',
              '',
              '',
              '',
              `Total (${detail.contributions.length})`,
              formatMoney(
                detail.contributions.reduce((sum, row) => sum + row.amount, 0),
              ),
            ]
          : undefined,
      emptyMessage: voided
        ? 'Al anular la liquidación, sus diezmos quedaron liberados y ya no figuran en ella.'
        : 'Esta liquidación no incluye diezmos.',
      notes: [
        `Liquidación ${detail.number} de ${detail.congregationName}, emitida el ${formatLongDate(detail.settledOn)}. Cubre los diezmos recibidos del ${formatShortDate(detail.coveredFrom)} al ${formatShortDate(detail.coveredTo)}.`,
        ...detail.cashLines.map(cashLineNote),
        ...(voided && detail.voidedAt
          ? [
              `ANULADA el ${formatShortDate(bogotaDateOf(new Date(detail.voidedAt)))}${detail.voidedByName ? ` por ${detail.voidedByName}` : ''}. Motivo: ${detail.voidReason ?? 'no registrado'}.`,
            ]
          : []),
      ],
      signatures: ['Tesorero(a)', 'Pastor(a)', 'Fiscal / Revisor'],
    });
    return {
      filename: `acta-liquidacion-${fileSlug(detail.number)}.pdf`,
      content,
    };
  }
}
