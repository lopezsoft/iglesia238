import type { DocumentBrandingService } from '../../../common/branding/document-branding.js';
import {
  BusinessRuleException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { CSV_BOM } from '../../../common/export/csv-document.js';
import type { ReportLetterheadReader } from '../../../common/reports/report-letterhead.js';
import type {
  ReportDocument,
  ReportPdfRenderer,
} from '../../../common/reports/report-pdf.js';
import type { Clock } from '../../../common/time/bogota-time.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  CASH_BOOK_REPORT_MAX_LINES,
  CashBookReportService,
} from './cash-book-report.service.js';
import type { CashBookQueryService } from './cash-book-query.service.js';
import type { CashBookRowView, CashBookViewResult } from './cash-book.views.js';

const money = (value: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const row = (overrides: Partial<CashBookRowView>): CashBookRowView => ({
  id: 1,
  postedOn: '2026-11-02',
  voucherCode: 'CI-2026-00012',
  accountCode: '410505',
  accountName: 'Diezmos',
  description: 'Diezmos del domingo',
  direction: 'IN',
  amount: 250_000,
  balance: 1_250_000,
  status: 'POSTED',
  relatedVoucherCode: null,
  reversalBlock: null,
  ...overrides,
});

function bookWith(
  rows: readonly CashBookRowView[],
  overrides: Partial<CashBookViewResult> = {},
): CashBookViewResult {
  return {
    fundId: 1,
    fundName: 'Fondo General',
    fundIsActive: true,
    period: {
      id: 7,
      year: 2026,
      month: 11,
      status: 'OPEN',
      label: 'Noviembre 2026',
      closedAt: null,
      from: '2026-11-01',
      to: '2026-11-30',
    },
    opening: 1_000_000,
    income: 250_000,
    expense: 100_000,
    closing: 1_150_000,
    inCount: 1,
    outCount: 1,
    rows,
    totalRows: rows.length,
    page: 1,
    pageSize: CASH_BOOK_REPORT_MAX_LINES,
    ...overrides,
  } as CashBookViewResult;
}

const NORMAL_ROWS = [
  row({}),
  row({
    id: 2,
    postedOn: '2026-11-03',
    voucherCode: 'CE-2026-00045',
    accountCode: '510506',
    accountName: 'Servicios públicos',
    description: 'Pago de servicios',
    direction: 'OUT',
    amount: 100_000,
    balance: 1_150_000,
  }),
];

const LETTERHEAD = {
  denominationName: 'Iglesia Cristiana Monte de Sion',
  legalName: 'Corporación Iglesia Cristiana Monte de Sion',
  taxId: '900.123.456-7',
  congregationName: 'Sede Central',
};

function build(
  book: CashBookViewResult,
  options: { letterhead?: typeof LETTERHEAD | null; branding?: object } = {},
) {
  const view = vi.fn().mockResolvedValue(book);
  const render = vi.fn<(report: ReportDocument) => Promise<Buffer>>().mockResolvedValue(Buffer.from('%PDF-fake'));
  const letterhead = options.letterhead === undefined ? LETTERHEAD : options.letterhead;
  const service = new CashBookReportService(
    { view } as unknown as CashBookQueryService,
    { find: vi.fn().mockResolvedValue(letterhead) } as ReportLetterheadReader,
    { render } as ReportPdfRenderer,
    {
      current: vi.fn().mockResolvedValue(options.branding ?? {}),
    } as unknown as DocumentBrandingService,
    { today: () => '2026-11-08' } as Clock,
  );
  return { service, view, render };
}

const treasurer = buildTenantContext({
  permissions: ['cash-transactions.write'],
});
const INPUT = { fundId: 1, periodId: 7 };

function sent(render: ReturnType<typeof build>['render']): ReportDocument {
  return render.mock.calls[0][0];
}

describe('CashBookReportService.pdf', () => {
  it('asks for the whole month of the fund: one page of up to the cap, no filters', async () => {
    const { service, view } = build(bookWith(NORMAL_ROWS));

    await service.pdf(treasurer, INPUT);

    expect(view).toHaveBeenCalledWith(treasurer, {
      fundId: 1,
      periodId: 7,
      page: 1,
      pageSize: CASH_BOOK_REPORT_MAX_LINES,
    });
  });

  it('prints a landscape report titled with the fund, the month and the state of the period', async () => {
    const { service, render } = build(bookWith(NORMAL_ROWS));

    const file = await service.pdf(treasurer, INPUT);

    const report = sent(render);
    expect(report.title).toBe('Libro de caja');
    expect(report.subtitle).toBe('Fondo General · Noviembre 2026 · Periodo abierto');
    expect(report.orientation).toBe('landscape');
    expect(report.generatedOn).toBe('2026-11-08');
    expect(report.letterhead).toEqual(LETTERHEAD);
    expect(file.content.equals(Buffer.from('%PDF-fake'))).toBe(true);
  });

  it('says the period is closed when it is', async () => {
    const closed = bookWith(NORMAL_ROWS, {
      period: { ...bookWith([]).period, status: 'CLOSED' },
    });
    const { service, render } = build(closed);

    await service.pdf(treasurer, INPUT);

    expect(sent(render).subtitle).toContain('Periodo cerrado');
  });

  it('shows the figures of the month, with the number of entries and exits', async () => {
    const { service, render } = build(bookWith(NORMAL_ROWS));

    await service.pdf(treasurer, INPUT);

    expect(sent(render).summary).toEqual([
      { label: 'Saldo inicial', value: money(1_000_000) },
      { label: 'Entradas (1)', value: money(250_000) },
      { label: 'Salidas (1)', value: money(100_000) },
      { label: 'Saldo final', value: money(1_150_000) },
    ]);
  });

  it('starts with the opening balance, follows with each line and its running balance, and ends with the totals', async () => {
    const { service, render } = build(bookWith(NORMAL_ROWS));

    await service.pdf(treasurer, INPUT);

    const report = sent(render);
    expect(report.rows).toEqual([
      {
        cells: ['01/11/2026', '', '', 'Saldo inicial', '', '', money(1_000_000)],
        style: 'strong',
      },
      {
        cells: [
          '02/11/2026',
          'CI-2026-00012',
          '410505 · Diezmos',
          'Diezmos del domingo',
          money(250_000),
          '',
          money(1_250_000),
        ],
        style: 'normal',
      },
      {
        cells: [
          '03/11/2026',
          'CE-2026-00045',
          '510506 · Servicios públicos',
          'Pago de servicios',
          '',
          money(100_000),
          money(1_150_000),
        ],
        style: 'normal',
      },
    ]);
    expect(report.totals).toEqual([
      '',
      '',
      '',
      'Totales del mes',
      money(250_000),
      money(100_000),
      money(1_150_000),
    ]);
    // Every row has a cell per column.
    for (const printed of report.rows) {
      expect(printed.cells).toHaveLength(report.columns.length);
    }
  });

  it('leaves a reversed line and its reversal in the book, in grey and marked, and explains it', async () => {
    const { service, render } = build(
      bookWith([
        ...NORMAL_ROWS,
        row({ id: 3, description: 'Compra de sillas', direction: 'OUT', amount: 50_000, status: 'REVERSED' }),
        row({
          id: 4,
          description: 'Compra de sillas',
          direction: 'IN',
          amount: 50_000,
          status: 'REVERSAL',
          relatedVoucherCode: 'CE-2026-00046',
        }),
      ]),
    );

    await service.pdf(treasurer, INPUT);

    const report = sent(render);
    const [reversed, reversal] = report.rows.slice(-2);
    expect(reversed.style).toBe('muted');
    expect(reversed.cells[3]).toBe('Compra de sillas (reversada)');
    expect(reversal.style).toBe('muted');
    expect(reversal.cells[3]).toBe('Compra de sillas (reversa de CE-2026-00046)');
    expect(report.notes?.[0]).toContain('en gris');
  });

  it('adds no note about reversals when there are none', async () => {
    const { service, render } = build(bookWith(NORMAL_ROWS));

    await service.pdf(treasurer, INPUT);

    expect(sent(render).notes).toEqual([]);
  });

  it('prints the opening balance and zero totals for a month without movements', async () => {
    const empty = bookWith([], { income: 0, expense: 0, closing: 1_000_000, inCount: 0, outCount: 0 });
    const { service, render } = build(empty);

    await service.pdf(treasurer, INPUT);

    const report = sent(render);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].cells[3]).toBe('Saldo inicial');
    expect(report.totals?.[4]).toBe(money(0));
  });

  it('has the three signature lines of the treasury, the pastor and the auditor', async () => {
    const { service, render } = build(bookWith(NORMAL_ROWS));

    await service.pdf(treasurer, INPUT);

    expect(sent(render).signatures).toEqual(['Tesorero(a)', 'Pastor(a)', 'Fiscal / Revisor']);
  });

  it('dresses the report with the logo and the color of the denomination', async () => {
    const logo = Buffer.from('logo-bytes');
    const { service, render } = build(bookWith(NORMAL_ROWS), {
      branding: { accentColor: '#8b0000', logo },
    });

    await service.pdf(treasurer, INPUT);

    expect(sent(render).accentColor).toBe('#8b0000');
    expect(sent(render).logo).toBe(logo);
  });

  it('prints with the default look when the denomination chose nothing', async () => {
    const { service, render } = build(bookWith(NORMAL_ROWS));

    await service.pdf(treasurer, INPUT);

    expect(sent(render).accentColor).toBeUndefined();
    expect(sent(render).logo).toBeUndefined();
  });

  it.each([
    ['Fondo General', 'libro-de-caja-2026-11-fondo-general.pdf'],
    ['Fondo de Construcción', 'libro-de-caja-2026-11-fondo-de-construccion.pdf'],
    ['  Misiones & Ayuda / Social!! ', 'libro-de-caja-2026-11-misiones-ayuda-social.pdf'],
    ['¿¿¿', 'libro-de-caja-2026-11-fondo.pdf'],
  ])('names the file after the month and the fund: %s', async (fundName, expected) => {
    const { service } = build(bookWith(NORMAL_ROWS, { fundName }));

    const file = await service.pdf(treasurer, INPUT);

    expect(file.filename).toBe(expected);
  });

  it('refuses a month too big for one report, without drawing anything', async () => {
    const { service, render } = build(
      bookWith(NORMAL_ROWS, { totalRows: CASH_BOOK_REPORT_MAX_LINES + 1 }),
    );

    const failure = await service.pdf(treasurer, INPUT).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BusinessRuleException);
    expect((failure as { code: string }).code).toBe('CASH_BOOK_REPORT_TOO_LARGE');
    expect(render).not.toHaveBeenCalled();
  });

  it('accepts a month at exactly the cap', async () => {
    const { service } = build(bookWith(NORMAL_ROWS, { totalRows: CASH_BOOK_REPORT_MAX_LINES }));

    await expect(service.pdf(treasurer, INPUT)).resolves.toBeDefined();
  });

  it('answers 404 when the sede does not exist', async () => {
    const { service, render } = build(bookWith(NORMAL_ROWS), { letterhead: null });

    await expect(service.pdf(treasurer, INPUT)).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(render).not.toHaveBeenCalled();
  });

  it('lets the errors of the book (a period or a fund that does not exist) through', async () => {
    const { service, view } = build(bookWith(NORMAL_ROWS));
    view.mockRejectedValue(new NotFoundDomainException('El periodo no existe', 'PERIOD_NOT_FOUND'));

    await expect(service.pdf(treasurer, INPUT)).rejects.toMatchObject({ code: 'PERIOD_NOT_FOUND' });
  });
});

describe('CashBookReportService.csv', () => {
  const lines = (content: string) => content.replace(CSV_BOM, '').trimEnd().split('\r\n');

  it('is a UTF-8 spreadsheet with BOM, semicolons and a header', async () => {
    const { service } = build(bookWith(NORMAL_ROWS));

    const file = await service.csv(treasurer, INPUT);

    expect(file.filename).toBe('libro-de-caja-2026-11-fondo-general.csv');
    expect(file.content.startsWith(CSV_BOM)).toBe(true);
    expect(lines(file.content)[0]).toBe(
      'Fecha;Comprobante;Código de cuenta;Cuenta;Descripción;Sentido;Entrada;Salida;Saldo;Estado',
    );
  });

  it('has the opening balance first and then each line, with plain numbers that can be added up', async () => {
    const { service } = build(bookWith(NORMAL_ROWS));

    const content = (await service.csv(treasurer, INPUT)).content;

    expect(lines(content).slice(1)).toEqual([
      '01/11/2026;;;;Saldo inicial;;;;1000000;',
      '02/11/2026;CI-2026-00012;410505;Diezmos;Diezmos del domingo;Entrada;250000;;1250000;Vigente',
      '03/11/2026;CE-2026-00045;510506;Servicios públicos;Pago de servicios;Salida;;100000;1150000;Vigente',
    ]);
  });

  it('marks reversed lines and their reversal', async () => {
    const { service } = build(
      bookWith([
        row({ id: 3, status: 'REVERSED' }),
        row({ id: 4, status: 'REVERSAL', relatedVoucherCode: 'CE-1' }),
      ]),
    );

    const out = lines((await service.csv(treasurer, INPUT)).content);

    expect(out[2].endsWith(';Reversada')).toBe(true);
    expect(out[3].endsWith(';Reversa')).toBe(true);
  });

  it('neutralizes a description that a spreadsheet would run as a formula', async () => {
    const { service } = build(
      bookWith([row({ description: '=HYPERLINK("http://malo.example","clic")' })]),
    );

    const content = (await service.csv(treasurer, INPUT)).content;

    expect(content).toContain(`'=HYPERLINK`);
    expect(content).not.toMatch(/;=HYPERLINK/);
  });

  it('quotes a description that contains the separator or a line break', async () => {
    const { service } = build(
      bookWith([row({ description: 'Pago; con "comillas"\ny salto' })]),
    );

    const content = (await service.csv(treasurer, INPUT)).content;

    expect(content).toContain('"Pago; con ""comillas""\ny salto"');
  });

  it('applies the same cap as the PDF', async () => {
    const { service } = build(
      bookWith(NORMAL_ROWS, { totalRows: CASH_BOOK_REPORT_MAX_LINES + 1 }),
    );

    await expect(service.csv(treasurer, INPUT)).rejects.toBeInstanceOf(BusinessRuleException);
  });
});
