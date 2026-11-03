import type { VoucherPdfInput } from '../application/ports/voucher-pdf.renderer.js';
import { PdfkitVoucherRenderer } from './pdfkit-voucher.renderer.js';

const base: VoucherPdfInput = {
  code: 'REC-2026-00031',
  title: 'Recibo de aporte',
  issuedOn: '2026-11-02',
  letterhead: {
    denominationName: 'Iglesia Cristiana Monte de Sion',
    legalName: 'Corporación Monte de Sion',
    taxId: '900.123.456-7',
    congregationName: 'Sede Central',
  },
  total: 1_590_000.5,
  voided: false,
  voidReason: null,
  lines: [],
  contributions: [
    {
      receivedOn: '2026-11-02',
      typeName: 'Diezmo',
      contributorName: 'Ana María Rojas Díaz',
      paymentMethodLabel: 'Efectivo',
      amount: 1_500_000,
    },
    {
      receivedOn: '2026-11-02',
      typeName: 'Ofrenda',
      contributorName: null,
      paymentMethodLabel: 'Transferencia',
      amount: 90_000.5,
    },
  ],
};

/** Number of pages in a PDF written by pdfkit (one "/Type /Page" object per page). */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
}

describe('PdfkitVoucherRenderer', () => {
  const renderer = new PdfkitVoucherRenderer();

  it('draws a one-page receipt, also when it is voided', async () => {
    const issued = await renderer.render(base);
    const voided = await renderer.render({
      ...base,
      voided: true,
      voidReason: 'Valor mal digitado',
    });

    expect(issued.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(issued)).toBe(1);
    expect(pageCount(voided)).toBe(1);
    expect(voided.length).toBeGreaterThan(1000);
  });

  it('draws a cash voucher with its lines', async () => {
    const pdf = await renderer.render({
      ...base,
      code: 'CE-2026-00007',
      title: 'Comprobante de egreso',
      contributions: [],
      lines: [
        {
          description: 'Servicios públicos',
          accountLabel: '510505 · Servicios',
          fundName: 'Fondo Local',
          direction: 'OUT',
          amount: 100_000,
        },
      ],
      total: 100_000,
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('continues on a new page when there are too many rows, keeping every page closed', async () => {
    const many = Array.from({ length: 80 }, (_, index) => ({
      receivedOn: '2026-11-02',
      typeName: 'Diezmo',
      contributorName: `Aportante ${index + 1}`,
      paymentMethodLabel: 'Efectivo',
      amount: 10_000,
    }));

    const pdf = await renderer.render({ ...base, contributions: many });

    expect(pageCount(pdf)).toBeGreaterThan(1);
  });
});
