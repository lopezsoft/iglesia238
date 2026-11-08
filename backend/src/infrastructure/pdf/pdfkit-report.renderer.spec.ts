import PDFDocument from 'pdfkit';
import { jpeg, png } from '../../../test/support/images.js';
import type {
  ReportDocument,
  ReportRow,
} from '../../common/reports/report-pdf.js';
import { PdfkitReportRenderer } from './pdfkit-report.renderer.js';

const BASE: ReportDocument = {
  title: 'Libro de caja',
  subtitle: 'Fondo General · noviembre de 2026',
  letterhead: {
    denominationName: 'Iglesia Cristiana Monte de Sion',
    legalName: 'Corporación Iglesia Cristiana Monte de Sion',
    taxId: '900.123.456-7',
    congregationName: 'Sede Central',
  },
  generatedOn: '2026-11-08',
  summary: [
    { label: 'Saldo inicial', value: '$ 1.000.000' },
    { label: 'Entradas', value: '$ 250.000' },
    { label: 'Salidas', value: '$ 100.000' },
    { label: 'Saldo final', value: '$ 1.150.000' },
  ],
  columns: [
    { header: 'Fecha', weight: 1 },
    { header: 'Descripción', weight: 4 },
    { header: 'Valor', weight: 2, align: 'right' },
  ],
  rows: [
    { cells: ['02/11/2026', 'Diezmos del domingo', '$ 250.000'] },
    { cells: ['03/11/2026', 'Pago de servicios', '$ 100.000'] },
  ],
  totals: ['', 'Total', '$ 350.000'],
  signatures: ['Tesorero(a)', 'Pastor(a)', 'Fiscal'],
};

/** Number of pages in a PDF written by pdfkit (one "/Type /Page" object per page). */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
}

/** The texts the renderer draws, in order: the PDF is compressed, so the test listens to the drawing instead. */
async function drawnTexts(run: () => Promise<Buffer>): Promise<{
  pdf: Buffer;
  texts: string[];
}> {
  const prototype = PDFDocument.prototype as InstanceType<typeof PDFDocument>;
  const spy = vi.spyOn(prototype, 'text');
  try {
    const pdf = await run();
    return { pdf, texts: spy.mock.calls.map(([text]) => String(text)) };
  } finally {
    spy.mockRestore();
  }
}

const many = (count: number, prefix = 'Fila'): ReportRow[] =>
  Array.from({ length: count }, (_, i) => ({
    cells: [
      `${prefix} ${i + 1}`,
      `Descripción del movimiento ${i + 1}`,
      '$ 1.000',
    ],
  }));

describe('PdfkitReportRenderer', () => {
  const renderer = new PdfkitReportRenderer();

  it('draws a short report on one page with the letterhead, the figures, the table, the signatures and the footer', async () => {
    const { pdf, texts } = await drawnTexts(() => renderer.render(BASE));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
    expect(texts).toEqual(
      expect.arrayContaining([
        'Iglesia Cristiana Monte de Sion',
        'Razón social: Corporación Iglesia Cristiana Monte de Sion  ·  NIT 900.123.456-7',
        'Sede Central',
        'Libro de caja',
        'Fondo General · noviembre de 2026',
        'Saldo inicial',
        '$ 1.150.000',
        'Fecha',
        'Diezmos del domingo',
        'Total',
        '$ 350.000',
        'Tesorero(a)',
        'Pastor(a)',
        'Fiscal',
        'Página 1 de 1',
      ]),
    );
    expect(
      texts.some((text) => text.includes('Generado el 8 de noviembre de 2026')),
    ).toBe(true);
  });

  it('is portrait by default and landscape when asked', async () => {
    const portrait = await renderer.render(BASE);
    const landscape = await renderer.render({
      ...BASE,
      orientation: 'landscape',
    });

    expect(portrait.toString('latin1')).toContain('/MediaBox [0 0 612 792]');
    expect(landscape.toString('latin1')).toContain('/MediaBox [0 0 792 612]');
  });

  it('continues on new pages, repeats the header of the table and numbers every page', async () => {
    const { pdf, texts } = await drawnTexts(() =>
      renderer.render({ ...BASE, rows: many(150) }),
    );

    const pages = pageCount(pdf);
    expect(pages).toBeGreaterThan(2);
    expect(texts.filter((text) => text === 'Fecha')).toHaveLength(pages);
    for (let page = 1; page <= pages; page += 1) {
      expect(texts).toContain(`Página ${page} de ${pages}`);
    }
    expect(texts).not.toContain(`Página ${pages + 1} de ${pages}`);
  });

  it('prints every row exactly once, however many pages it takes', async () => {
    const { texts } = await drawnTexts(() =>
      renderer.render({ ...BASE, rows: many(200), orientation: 'landscape' }),
    );

    for (let index = 1; index <= 200; index += 1) {
      expect(texts.filter((text) => text === `Fila ${index}`)).toHaveLength(1);
    }
  });

  it('wraps a long text inside its column instead of overflowing, and still prints every row', async () => {
    const long =
      'Compra de materiales para la reparación del techo del templo y del salón de niños, '.repeat(
        6,
      );
    const rows: ReportRow[] = Array.from({ length: 40 }, (_, i) => ({
      cells: [`Fila ${i + 1}`, long, '$ 1.000'],
    }));

    const { pdf, texts } = await drawnTexts(() =>
      renderer.render({ ...BASE, rows }),
    );

    expect(pageCount(pdf)).toBeGreaterThan(1);
    for (let index = 1; index <= 40; index += 1) {
      expect(texts.filter((text) => text === `Fila ${index}`)).toHaveLength(1);
    }
  });

  it('keeps the signatures together on one page: if they do not fit after the table, they all move', async () => {
    // Fill the first page nearly to the end so the signatures cannot fit under the table.
    for (let rows = 25; rows <= 60; rows += 1) {
      const { pdf, texts } = await drawnTexts(() =>
        renderer.render({ ...BASE, rows: many(rows) }),
      );
      const pages = pageCount(pdf);
      // Every title appears exactly once (never split or repeated), whatever the table length.
      for (const title of ['Tesorero(a)', 'Pastor(a)', 'Fiscal']) {
        expect(
          texts.filter((text) => text === title),
          `${rows} rows`,
        ).toHaveLength(1);
      }
      expect(texts).toContain(`Página ${pages} de ${pages}`);
    }
  });

  it('says there is nothing to show, and still prints the figures and the signatures', async () => {
    const { texts } = await drawnTexts(() =>
      renderer.render({
        ...BASE,
        rows: [],
        totals: undefined,
        emptyMessage: 'No hubo movimientos en el periodo.',
      }),
    );

    expect(texts).toContain('No hubo movimientos en el periodo.');
    expect(texts).toContain('Saldo final');
    expect(texts).toContain('Pastor(a)');
  });

  it('prints notes, and works without figures, totals or signatures', async () => {
    const { pdf, texts } = await drawnTexts(() =>
      renderer.render({
        ...BASE,
        summary: undefined,
        totals: undefined,
        signatures: undefined,
        notes: ['Las líneas reversadas se muestran en gris.'],
      }),
    );

    expect(pageCount(pdf)).toBe(1);
    expect(texts).toContain('Las líneas reversadas se muestran en gris.');
  });

  it('lets a row be strong or muted without losing its text', async () => {
    const { texts } = await drawnTexts(() =>
      renderer.render({
        ...BASE,
        rows: [
          { cells: ['', 'Saldo inicial', '$ 1.000.000'], style: 'strong' },
          { cells: ['02/11/2026', 'Reversado', '$ 5.000'], style: 'muted' },
        ],
      }),
    );

    expect(texts).toEqual(
      expect.arrayContaining(['Saldo inicial', 'Reversado']),
    );
  });

  it('dresses the report with the logo and the color of the denomination', async () => {
    const plain = await renderer.render(BASE);

    const withPng = await renderer.render({
      ...BASE,
      logo: png(200, 100),
      accentColor: '#8b0000',
    });
    const withJpeg = await renderer.render({
      ...BASE,
      logo: jpeg(300, 300),
      accentColor: '#006400',
    });

    expect(pageCount(withPng)).toBe(1);
    expect(withPng.equals(plain)).toBe(false);
    expect(withPng.length).toBeGreaterThan(plain.length);
    expect(withJpeg.equals(withPng)).toBe(false);
  });

  it('changes only the color when there is no logo', async () => {
    const plain = await renderer.render(BASE);

    const colored = await renderer.render({ ...BASE, accentColor: '#8b0000' });

    expect(colored.equals(plain)).toBe(false);
  });

  it('prints the report without the logo when the picture cannot be drawn', async () => {
    const pdf = await renderer.render({
      ...BASE,
      logo: Buffer.from('this is not an image'),
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('tolerates missing cells', async () => {
    const pdf = await renderer.render({
      ...BASE,
      rows: [{ cells: ['solo la fecha'] }],
      totals: ['', 'Total'],
    });

    expect(pageCount(pdf)).toBe(1);
  });
});
