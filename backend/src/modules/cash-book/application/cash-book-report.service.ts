import { Inject, Injectable } from '@nestjs/common';
import { DocumentBrandingService } from '../../../common/branding/document-branding.js';
import {
  BusinessRuleException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { csvDate, toCsvDocument } from '../../../common/export/csv-document.js';
import {
  REPORT_LETTERHEAD_READER,
  type ReportLetterheadReader,
} from '../../../common/reports/report-letterhead.js';
import {
  REPORT_PDF_RENDERER,
  type ReportDocument,
  type ReportPdfRenderer,
  type ReportRow,
} from '../../../common/reports/report-pdf.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
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

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dayFormat = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

function shortDate(isoDate: string): string {
  return dayFormat.format(new Date(`${isoDate}T00:00:00.000Z`));
}

/** "Fondo General" becomes "fondo-general": a file name people can read and a server can serve. */
function slug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'fondo'
  );
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
    @Inject(REPORT_LETTERHEAD_READER)
    private readonly letterheads: ReportLetterheadReader,
    @Inject(REPORT_PDF_RENDERER) private readonly renderer: ReportPdfRenderer,
    private readonly branding: DocumentBrandingService,
    private readonly clock: Clock,
  ) {}

  async pdf(
    tenant: TenantContext,
    input: CashBookReportInput,
  ): Promise<CashBookReportFile<Buffer>> {
    const book = await this.load(tenant, input);
    const scope = tenant.congregationScope();
    const [letterhead, branding] = await Promise.all([
      this.letterheads.find(scope),
      this.branding.current(scope),
    ]);
    if (!letterhead) {
      throw new NotFoundDomainException('La sede no existe.');
    }
    const content = await this.renderer.render({
      ...this.document(book),
      letterhead,
      generatedOn: this.clock.today(),
      ...branding,
    });
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
    return `libro-de-caja-${book.period.year}-${month}-${slug(book.fundName)}`;
  }

  /** The report without the parts that come from outside (letterhead, date, branding). */
  private document(
    book: CashBookViewResult,
  ): Omit<ReportDocument, 'letterhead' | 'generatedOn'> {
    const lines: ReportRow[] = book.rows.map((row) => ({
      cells: [
        shortDate(row.postedOn),
        row.voucherCode,
        `${row.accountCode} · ${row.accountName}`,
        describe(row),
        row.direction === 'IN' ? money.format(row.amount) : '',
        row.direction === 'OUT' ? money.format(row.amount) : '',
        money.format(row.balance),
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
        { label: 'Saldo inicial', value: money.format(book.opening) },
        {
          label: `Entradas (${book.inCount})`,
          value: money.format(book.income),
        },
        {
          label: `Salidas (${book.outCount})`,
          value: money.format(book.expense),
        },
        { label: 'Saldo final', value: money.format(book.closing) },
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
            shortDate(book.period.from),
            '',
            '',
            'Saldo inicial',
            '',
            '',
            money.format(book.opening),
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
        money.format(book.income),
        money.format(book.expense),
        money.format(book.closing),
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
