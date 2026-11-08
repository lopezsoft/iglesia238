import { buildCertificateSnapshot } from '../application/certificate-document.js';
import { PdfkitDocumentRenderer } from './pdfkit-document.renderer.js';

const snapshot = buildCertificateSnapshot({
  number: 'CERT-MEM-2026-0031',
  typeCode: 'MEM',
  typeName: 'Certificado de membresía',
  template: null,
  issuedOn: '2026-11-02',
  letterhead: {
    denominationName: 'Iglesia Cristiana Monte de Sion',
    legalName: 'Iglesia Cristiana Monte de Sion',
    taxId: '900.123.456-7',
    congregationName: 'Sede Central',
    cityName: 'Bogotá, D.C.',
    locationLine: 'Sede Central · Bogotá, D.C. · Distrito 1',
  },
  pastorName: 'Pastor Daniel Herrera',
  secretaryName: 'Marta Castillo',
  issuedByName: 'Marta Castillo',
  member: {
    fullName: 'Ana María Rojas Díaz',
    code: 'SC-0130',
    documentLabel: 'CC 52.418.916',
    joinedOn: '2008-04-10',
    waterBaptismOn: null,
  },
  notes: 'Para trámite de visa',
});

/** Number of pages in a PDF written by pdfkit (one "/Type /Page" object per page). */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
}

describe('PdfkitDocumentRenderer', () => {
  const renderer = new PdfkitDocumentRenderer();

  it('draws a one-page certificate, also when it is voided or long', async () => {
    const issued = await renderer.certificate({
      snapshot,
      issuedOn: '2026-11-02',
      expiresOn: '2027-02-02',
      voided: false,
    });
    const voided = await renderer.certificate({
      snapshot: { ...snapshot, notes: 'Observación muy larga. '.repeat(10) },
      issuedOn: '2026-11-02',
      expiresOn: null,
      voided: true,
    });

    expect(issued.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(issued)).toBe(1);
    expect(pageCount(voided)).toBe(1);
    expect(voided.length).toBeGreaterThan(1000);
  });

  it('draws the verification QR code on one page, also on a voided certificate', async () => {
    const withoutQr = await renderer.certificate({
      snapshot,
      issuedOn: '2026-11-02',
      expiresOn: null,
      voided: false,
    });
    const verificationUrl =
      'https://app.iglesia238.com/verify-certificate?t=42.AbCdEfGhIjKlMnOpQrStUv';
    const withQr = await renderer.certificate({
      snapshot,
      issuedOn: '2026-11-02',
      expiresOn: null,
      voided: false,
      verificationUrl,
    });
    const voidedWithQr = await renderer.certificate({
      snapshot,
      issuedOn: '2026-11-02',
      expiresOn: null,
      voided: true,
      verificationUrl,
    });

    expect(pageCount(withQr)).toBe(1);
    expect(pageCount(voidedWithQr)).toBe(1);
    // The QR code is hundreds of vector squares: the page content grows even after pdfkit compresses it.
    expect(withQr.length).toBeGreaterThan(withoutQr.length);
  });

  it('draws a two-page card (front and back) whatever its state', async () => {
    for (const status of ['VALID', 'EXPIRED', 'VOIDED'] as const) {
      const card = await renderer.card({
        denominationName: 'Iglesia Cristiana Monte de Sion',
        congregationName: 'Sede Central',
        memberName: 'Ana María Rojas Díaz de la Concepción Pérez Gómez',
        cardNumber: 'SC-0130',
        issuedOn: '2026-11-02',
        expiresOn: '2028-11-02',
        status,
      });

      expect(card.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pageCount(card)).toBe(2);
    }
  });
});
