import { Injectable } from '@nestjs/common';
import { BusinessRuleException } from '../../../common/errors/domain.exception.js';
import { csvDate, toCsvDocument } from '../../../common/export/csv-document.js';
import {
  fileSlug,
  formatMoney,
  formatShortDate,
} from '../../../common/reports/report-format.js';
import {
  ReportIssuer,
  type ReportBody,
} from '../../../common/reports/report-issuer.js';
import type { ReportRow } from '../../../common/reports/report-pdf.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { CashBookQueryService } from './cash-book-query.service.js';
import type { CashBookRowView, CashBookViewResult } from './cash-book.views.js';

/** A month of a sede has far fewer lines than this; the cap only stops a runaway export. */
export const CASH_BOOK_REPORT_MAX_LINES = 5000;

export interface CashBookReportInput {
  readonly fundId: number;
  readonly periodId: number;
}

export interface CashBookReportFile<Content> {
  readonly filename: string;
  readonly content: Content;
}

/** What the line says about itself: a reversed line and its reversal are kept, marked, because the balance counts both. */
function describe(row: CashBookRowView): string {
  if (row.status === 'REVERSED') {
    return `${row.description} (reversada)`;
  }
  if (row.status === 'REVERSAL') {
    return row.relatedVoucherCode
      ? `${row.description} (reversa de ${row.relatedVoucherCode})`
      : `${row.description} (reversa)`;
  }
  return row.description;
}

const STATUS_LABELS = {
  POSTED: 'Vigente',
  REVERSED: 'Reversada',
  REVERSAL: 'Reversa',
} as const;

/**
 * The monthly cash book of a fund as a printable report (PDF) and as a spreadsheet (CSV). It reads the same figures as
 * the screen (opening balance, running balance per line, totals), through the same service and the same permission,
 * so what is printed is what the treasurer sees.
 */
@Injectable()
export class CashBookReportService {
  constructor(
    private readonly queries: CashBookQueryService,
    private readonly issuer: ReportIssuer,
  ) {}

  async pdf(
    tenant: TenantContext,
    input: CashBookReportInput,
  ): Promise<CashBookReportFile<Buffer>> {
    const book = await this.load(tenant, input);
    const content = await this.issuer.pdf(
      tenant.congregationScope(),
      this.document(book),
    );
    return { filename: `${this.baseName(book)}.pdf`, content };
  }

  async csv(
    tenant: TenantContext,
    input: CashBookReportInput,
  ): Promise<CashBookReportFile<string>> {
    const book = await this.load(tenant, input);
    const opening = [
      csvDate(book.period.from),
      '',
      '',
      '',
      'Saldo inicial',
      '',
      null,
      null,
      book.opening,
      '',
    ];
    const lines = book.rows.map((row) => [
      csvDate(row.postedOn),
      row.voucherCode,
      row.accountCode,
      row.accountName,
      row.description,
      row.direction === 'IN' ? 'Entrada' : 'Salida',
      row.direction === 'IN' ? row.amount : null,
      row.direction === 'OUT' ? row.amount : null,
      row.balance,
      STATUS_LABELS[row.status],
    ]);
    return {
      filename: `${this.baseName(book)}.csv`,
      content: toCsvDocument(
        [
          'Fecha',
          'Comprobante',
          'Código de cuenta',
          'Cuenta',
          'Descripción',
          'Sentido',
          'Entrada',
          'Salida',
          'Saldo',
          'Estado',
        ],
        [opening, ...lines],
      ),
    };
  }

  /** All the lines of the month, in posting order, without filters or pages. */
  private async load(
    tenant: TenantContext,
    input: CashBookReportInput,
  ): Promise<CashBookViewResult> {
    const book = await this.queries.view(tenant, {
      fundId: input.fundId,
      periodId: input.periodId,
      page: 1,
      pageSize: CASH_BOOK_REPORT_MAX_LINES,
    });
    if (book.totalRows > CASH_BOOK_REPORT_MAX_LINES) {
      throw new BusinessRuleException(
        `El libro de este mes tiene más de ${CASH_BOOK_REPORT_MAX_LINES} líneas: es demasiado grande para un solo informe.`,
        'CASH_BOOK_REPORT_TOO_LARGE',
      );
    }
    return book;
  }

  private baseName(book: CashBookViewResult): string {
    const month = String(book.period.month).padStart(2, '0');
    return `libro-de-caja-${book.period.year}-${month}-${fileSlug(book.fundName, 'fondo')}`;
  }

  /** The body of the report: the issuer adds the letterhead, the date and the look of the denomination. */
  private document(book: CashBookViewResult): ReportBody {
    const lines: ReportRow[] = book.rows.map((row) => ({
      cells: [
        formatShortDate(row.postedOn),
        row.voucherCode,
        `${row.accountCode} · ${row.accountName}`,
        describe(row),
        row.direction === 'IN' ? formatMoney(row.amount) : '',
        row.direction === 'OUT' ? formatMoney(row.amount) : '',
        formatMoney(row.balance),
      ],
      style: row.status === 'POSTED' ? 'normal' : 'muted',
    }));
    const hasReversals = book.rows.some((row) => row.status !== 'POSTED');
    const periodState = book.period.status === 'CLOSED' ? 'cerrado' : 'abierto';
    return {
      title: 'Libro de caja',
      subtitle: `${book.fundName} · ${book.period.label} · Periodo ${periodState}`,
      orientation: 'landscape',
      summary: [
        { label: 'Saldo inicial', value: formatMoney(book.opening) },
        {
          label: `Entradas (${book.inCount})`,
          value: formatMoney(book.income),
        },
        {
          label: `Salidas (${book.outCount})`,
          value: formatMoney(book.expense),
        },
        { label: 'Saldo final', value: formatMoney(book.closing) },
      ],
      columns: [
        { header: 'Fecha', weight: 1.1 },
        { header: 'Comprobante', weight: 1.6 },
        { header: 'Cuenta', weight: 2.6 },
        { header: 'Descripción', weight: 3.6 },
        { header: 'Entrada', weight: 1.4, align: 'right' },
        { header: 'Salida', weight: 1.4, align: 'right' },
        { header: 'Saldo', weight: 1.5, align: 'right' },
      ],
      rows: [
        {
          cells: [
            formatShortDate(book.period.from),
            '',
            '',
            'Saldo inicial',
            '',
            '',
            formatMoney(book.opening),
          ],
          style: 'strong',
        },
        ...lines,
      ],
      totals: [
        '',
        '',
        '',
        'Totales del mes',
        formatMoney(book.income),
        formatMoney(book.expense),
        formatMoney(book.closing),
      ],
      emptyMessage: 'No hay movimientos en este periodo.',
      notes: hasReversals
        ? [
            'Las líneas en gris son movimientos reversados o su reversa: se conservan para que el libro no tenga huecos y el saldo ya las incluye.',
          ]
        : [],
      signatures: ['Tesorero(a)', 'Pastor(a)', 'Fiscal / Revisor'],
    };
  }
}
