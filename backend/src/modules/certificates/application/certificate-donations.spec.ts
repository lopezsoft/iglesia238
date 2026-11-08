import {
  MAX_DONATION_LINES,
  buildCertificateSnapshot,
  summarizeDonations,
  type DonationInput,
  type SnapshotInput,
} from './certificate-document.js';

const BASE: SnapshotInput = {
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
  secretaryName: 'Marta Castillo',
  issuedByName: 'Pastor Daniel Herrera',
  member: {
    fullName: 'Ana María Rojas Díaz',
    code: 'SC-0130',
    documentLabel: 'CC 52.418.916',
    joinedOn: '2008-04-10',
    waterBaptismOn: null,
  },
  notes: null,
};

const line = (concept: string, receipts: number, pesos: number) => ({
  concept,
  receipts,
  amountCents: pesos * 100,
});

const DONATION: DonationInput = {
  fiscalYear: 2025,
  periodFrom: '2025-01-01',
  periodTo: '2025-12-31',
  lines: [line('Diezmo', 12, 1_000_000), line('Ofrenda', 8, 250_000)],
};

describe('summarizeDonations', () => {
  it('formats the lines and the total for print', () => {
    expect(summarizeDonations(DONATION)).toEqual({
      fiscalYear: 2025,
      periodFrom: '2025-01-01',
      periodTo: '2025-12-31',
      receipts: 20,
      total: '$1.250.000',
      totalInWords: 'un millón doscientos cincuenta mil pesos colombianos',
      lines: [
        { concept: 'Diezmo', receipts: 12, amount: '$1.000.000' },
        { concept: 'Ofrenda', receipts: 8, amount: '$250.000' },
      ],
    });
  });

  it('keeps every line up to the limit', () => {
    const lines = Array.from({ length: MAX_DONATION_LINES }, (_, i) =>
      line(`Concepto ${i}`, 1, 100),
    );

    const summary = summarizeDonations({ ...DONATION, lines });

    expect(summary.lines).toHaveLength(MAX_DONATION_LINES);
    expect(summary.lines.at(-1)?.concept).toBe(
      `Concepto ${MAX_DONATION_LINES - 1}`,
    );
  });

  it('adds the tail up in «Otros conceptos» when there are too many, without losing a peso', () => {
    const lines = Array.from({ length: MAX_DONATION_LINES + 3 }, (_, i) =>
      line(`Concepto ${i}`, 2, 1_000 * (i + 1)),
    );
    const totalPesos = lines.reduce((sum, l) => sum + l.amountCents / 100, 0);

    const summary = summarizeDonations({ ...DONATION, lines });

    expect(summary.lines).toHaveLength(MAX_DONATION_LINES);
    const others = summary.lines.at(-1)!;
    expect(others.concept).toBe('Otros conceptos');
    // The 4 concepts that did not fit (indexes 5..8): 6.000 + 7.000 + 8.000 + 9.000, two receipts each.
    expect(others).toEqual({
      concept: 'Otros conceptos',
      receipts: 8,
      amount: '$30.000',
    });
    expect(summary.total).toBe(
      `$${String(totalPesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`,
    );
    expect(summary.receipts).toBe(lines.length * 2);
  });
});

describe('donations certificate (DON)', () => {
  it('prints the legal entity, the period, the total and its words in the default body', () => {
    const snapshot = buildCertificateSnapshot({ ...BASE, donation: DONATION });

    expect(snapshot.title).toBe('CERTIFICADO DE DONACIONES');
    expect(snapshot.body).toContain(
      'Ana María Rojas Díaz, identificado(a) con CC 52.418.916,',
    );
    expect(snapshot.body).toContain(
      'Corporación Iglesia Cristiana Monte de Sion (NIT 900.123.456-7)',
    );
    expect(snapshot.body).toContain(
      'entre el 1 de enero de 2025 y el 31 de diciembre de 2025',
    );
    expect(snapshot.body).toContain(
      '$1.250.000 (un millón doscientos cincuenta mil pesos colombianos)',
    );
    expect(snapshot.donation?.lines).toHaveLength(2);
  });

  it('is signed by the treasury on the second line, by hand: the secretary is never printed', () => {
    const snapshot = buildCertificateSnapshot({ ...BASE, donation: DONATION });

    expect(snapshot.intro).toBe('La Tesorería de la Sede Central hace constar');
    expect(snapshot.secretaryName).toBeNull();
    expect(snapshot.secretaryTitle).toBe('Tesorero(a), Sede Central');
    expect(snapshot.pastorName).toBe('Pastor Daniel Herrera');
  });

  it('lets the denomination customize the texts with the donation placeholders', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      donation: DONATION,
      template:
        '{{memberName}} aportó {{totalAmount}} ({{totalInWords}}) en {{fiscalYear}}, del {{periodFrom}} al {{periodTo}}.',
      secretaryTitleTemplate: 'Representante legal, {{denomination}}',
    });

    expect(snapshot.body).toBe(
      'Ana María Rojas Díaz aportó $1.250.000 (un millón doscientos cincuenta mil pesos colombianos) en 2025, del 1 de enero de 2025 al 31 de diciembre de 2025.',
    );
    expect(snapshot.secretaryTitle).toBe(
      'Representante legal, Iglesia Cristiana Monte de Sion',
    );
  });

  it('refuses to build a donations certificate without donations', () => {
    expect(() => buildCertificateSnapshot({ ...BASE, donation: null })).toThrow(
      'donations',
    );
  });

  it('ignores the donations on any other type, which print as before', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      typeCode: 'MEM',
      typeName: 'Certificado de membresía',
      donation: DONATION,
    });

    expect(snapshot.donation).toBeUndefined();
    expect(snapshot.intro).toBe(
      'La Secretaría de la Sede Central hace constar',
    );
    expect(snapshot.secretaryName).toBe('Marta Castillo');
    expect(snapshot.body).not.toContain('1.250.000');
  });

  it('leaves the donation placeholders empty on the other types', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      typeCode: 'MEM',
      template: 'Año [{{fiscalYear}}] total [{{totalAmount}}]',
    });

    expect(snapshot.body).toBe('Año [] total []');
  });
});
