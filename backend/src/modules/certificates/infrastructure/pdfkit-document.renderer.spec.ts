import { jpeg, png } from '../../../../test/support/images.js';
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

  it('draws a donations certificate with its table on one page, also at the limit of lines and with notes', async () => {
    const donation = {
      fiscalYear: 2025,
      periodFrom: '2025-01-01',
      periodTo: '2025-12-31',
      lines: Array.from({ length: 9 }, (_, i) => ({
        concept: `Concepto ${i}`,
        receipts: 3,
        amountCents: (100_000 + i) * 100,
      })),
    };
    const donations = buildCertificateSnapshot({
      number: 'CERT-DON-2026-0001',
      typeCode: 'DON',
      typeName: 'Certificado de donaciones',
      template: null,
      issuedOn: '2026-11-08',
      letterhead: {
        denominationName: 'Iglesia Cristiana Monte de Sion',
        legalName: 'Corporación Iglesia Cristiana Monte de Sion',
        taxId: '900.123.456-7',
        congregationName: 'Sede Central',
        cityName: 'Bogotá, D.C.',
        locationLine: 'Sede Central · Bogotá, D.C. · Distrito 1',
      },
      pastorName: 'Pastor Daniel Herrera',
      secretaryName: null,
      issuedByName: 'Pastor Daniel Herrera',
      member: {
        fullName: 'Ana María Rojas Díaz de la Concepción Pérez Gómez',
        code: 'SC-0130',
        documentLabel: 'CC 52.418.916',
        joinedOn: '2008-04-10',
        waterBaptismOn: null,
      },
      notes: 'Para la declaración de renta del año gravable 2025.',
      donation,
    });

    const pdf = await renderer.certificate({
      snapshot: donations,
      issuedOn: '2026-11-08',
      expiresOn: null,
      voided: false,
      verificationUrl:
        'https://app.iglesia238.com/verify-certificate?t=42.AbCdEfGhIjKlMnOpQrStUv',
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
    expect(donations.donation?.lines).toHaveLength(6);
  });

  describe('with the identity of the denomination', () => {
    const base = {
      snapshot,
      issuedOn: '2026-11-02',
      expiresOn: null,
      voided: false,
    } as const;

    it('draws the logo and the color on a one-page certificate, for PNG and JPEG', async () => {
      const plain = await renderer.certificate(base);

      const withPng = await renderer.certificate({
        ...base,
        logo: png(200, 100),
        accentColor: '#8b0000',
      });
      const withJpeg = await renderer.certificate({
        ...base,
        logo: jpeg(300, 300),
        accentColor: '#006400',
      });

      expect(pageCount(withPng)).toBe(1);
      expect(pageCount(withJpeg)).toBe(1);
      // The logo is embedded and the color changes the drawing: neither can equal the default look.
      expect(withPng.equals(plain)).toBe(false);
      expect(withPng.length).toBeGreaterThan(plain.length);
      expect(withJpeg.equals(withPng)).toBe(false);
    });

    it('changes only the color when there is no logo', async () => {
      const plain = await renderer.certificate(base);

      const colored = await renderer.certificate({
        ...base,
        accentColor: '#8b0000',
      });

      expect(pageCount(colored)).toBe(1);
      expect(colored.equals(plain)).toBe(false);
    });

    it('prints the certificate without the logo when the picture cannot be drawn', async () => {
      const unreadable = await renderer.certificate({
        ...base,
        logo: Buffer.from('this is not an image'),
        accentColor: '#8b0000',
      });

      expect(unreadable.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pageCount(unreadable)).toBe(1);
    });

    it('keeps a donations certificate, at its limit of lines, on one page with the logo', async () => {
      const donations = buildCertificateSnapshot({
        number: 'CERT-DON-2026-0001',
        typeCode: 'DON',
        typeName: 'Certificado de donaciones',
        template: null,
        issuedOn: '2026-11-08',
        letterhead: {
          denominationName:
            'Corporación Iglesia Cristiana Monte de Sion de Colombia',
          legalName: 'Corporación Iglesia Cristiana Monte de Sion de Colombia',
          taxId: '900.123.456-7',
          congregationName: 'Sede Central',
          cityName: 'Bogotá, D.C.',
          locationLine: 'Sede Central · Bogotá, D.C. · Distrito 1',
        },
        pastorName: 'Pastor Daniel Herrera',
        secretaryName: null,
        issuedByName: 'Pastor Daniel Herrera',
        member: {
          fullName: 'Ana María Rojas Díaz de la Concepción Pérez Gómez',
          code: 'SC-0130',
          documentLabel: 'CC 52.418.916',
          joinedOn: '2008-04-10',
          waterBaptismOn: null,
        },
        notes: 'Para la declaración de renta del año gravable 2025.',
        donation: {
          fiscalYear: 2025,
          periodFrom: '2025-01-01',
          periodTo: '2025-12-31',
          lines: Array.from({ length: 9 }, (_, i) => ({
            concept: `Concepto ${i}`,
            receipts: 3,
            amountCents: (100_000 + i) * 100,
          })),
        },
      });

      const pdf = await renderer.certificate({
        snapshot: donations,
        issuedOn: '2026-11-08',
        expiresOn: null,
        voided: false,
        logo: png(200, 100),
        accentColor: '#8b0000',
        verificationUrl:
          'https://app.iglesia238.com/verify-certificate?t=42.AbCdEfGhIjKlMnOpQrStUv',
      });

      expect(pageCount(pdf)).toBe(1);
    });

    it('draws a two-page card with the logo and the color', async () => {
      const card = {
        denominationName: 'Iglesia Cristiana Monte de Sion',
        congregationName: 'Sede Central',
        memberName: 'Ana María Rojas Díaz',
        cardNumber: 'SC-0130',
        issuedOn: '2026-11-02',
        expiresOn: '2028-11-02',
        status: 'VALID',
      } as const;
      const plain = await renderer.card(card);

      const branded = await renderer.card({
        ...card,
        logo: png(120, 120),
        accentColor: '#006400',
      });
      const unreadable = await renderer.card({
        ...card,
        logo: Buffer.from('nope'),
        accentColor: '#006400',
      });

      expect(pageCount(branded)).toBe(2);
      expect(pageCount(unreadable)).toBe(2);
      expect(branded.equals(plain)).toBe(false);
    });
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
