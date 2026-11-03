import {
  addDays,
  buildCertificateSnapshot,
  daysBetween,
  documentLabel,
  longDate,
  maskedDocumentLabel,
  sedeReference,
  type SnapshotInput,
} from './certificate-document.js';
import { csvCell } from './use-cases/export-certificates.use-case.js';

const BASE: SnapshotInput = {
  number: 'CERT-BAU-2026-0015',
  typeCode: 'BAU',
  typeName: 'Certificado de bautismo',
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
    waterBaptismOn: '2009-04-12',
  },
  notes: '  ',
};

describe('certificate document rules', () => {
  it('adds days and counts days between ISO dates', () => {
    expect(addDays('2026-11-02', 30)).toBe('2026-12-02');
    expect(addDays('2026-12-20', 20)).toBe('2027-01-09');
    expect(daysBetween('2026-11-02', '2026-11-24')).toBe(22);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(-2);
  });

  it('writes dates and documents like the printed certificate', () => {
    expect(longDate('2026-11-02')).toBe('2 de noviembre de 2026');
    expect(documentLabel('CC', '52418916')).toBe('CC 52.418.916');
    expect(documentLabel('PAS', 'AB12345')).toBe('PAS AB12345');
    expect(documentLabel(null, null)).toBe('');
  });

  it('masks all but the last four characters of a document', () => {
    expect(maskedDocumentLabel('CC', '52418916')).toBe('CC ····8916');
    expect(maskedDocumentLabel('TI', '123')).toBe('TI ····');
    expect(maskedDocumentLabel(null, '52418916')).toBe('····8916');
    expect(maskedDocumentLabel('CC', null)).toBe('');
  });

  it('refers to the sede with or without the word "sede" in its name', () => {
    expect(sedeReference('Sede Central')).toBe('la Sede Central');
    expect(sedeReference('Vida Nueva')).toBe('la sede Vida Nueva');
  });

  it('builds the baptism text from the member data', () => {
    const snapshot = buildCertificateSnapshot(BASE);

    expect(snapshot.title).toBe('CERTIFICADO DE BAUTISMO');
    expect(snapshot.body).toContain(
      'recibió el bautismo en agua el 12 de abril de 2009',
    );
    expect(snapshot.body).toContain(
      'registro de membresía SC-0130 de la Sede Central',
    );
    expect(snapshot.notes).toBeNull();
    expect(snapshot.closing).toBe(
      'Se expide en Bogotá, D.C., el 2 de noviembre de 2026, a solicitud del interesado(a).',
    );
    expect(snapshot.pastorTitle).toBe('Pastor(a), Sede Central');
  });

  it('builds the membership, transfer and attendance texts', () => {
    const membership = buildCertificateSnapshot({ ...BASE, typeCode: 'MEM' });
    const transfer = buildCertificateSnapshot({ ...BASE, typeCode: 'TRA' });
    const attendance = buildCertificateSnapshot({ ...BASE, typeCode: 'ASI' });

    expect(membership.body).toContain('es miembro activo(a)');
    expect(membership.body).toContain('inscrito(a) con el código SC-0130');
    expect(transfer.body).toContain('solicita su traslado');
    expect(attendance.body).toContain('asiste regularmente');
  });

  it('does not invent a member code when the member has none', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      typeCode: 'MEM',
      member: { ...BASE.member, code: '' },
    });

    expect(snapshot.body).not.toContain('código');
  });

  it('prints a pastor placeholder when the sede has none and keeps trimmed notes', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      pastorName: null,
      secretaryName: null,
      notes: ' Para trámite de visa ',
    });

    expect(snapshot.pastorName).toBe('Pastor(a) de la sede');
    expect(snapshot.secretaryName).toBeNull();
    expect(snapshot.notes).toBe('Para trámite de visa');
  });

  it('uses the template of the type when the denomination customized it', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      template:
        'Se hace constar que {{memberName}} ({{document}}) es parte de {{sede}} desde {{joinedOn}}. {{unknown}}',
    });

    expect(snapshot.body).toBe(
      'Se hace constar que Ana María Rojas Díaz (CC 52.418.916) es parte de la Sede Central desde 10 de abril de 2008.',
    );
  });

  it('leaves out the city when the sede has none', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      letterhead: { ...BASE.letterhead, cityName: '' },
    });

    expect(snapshot.closing).toBe(
      'Se expide el 2 de noviembre de 2026, a solicitud del interesado(a).',
    );
  });
});

describe('csvCell', () => {
  it('quotes separators and quotes, and neutralizes spreadsheet formulas', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(null)).toBe('');
    expect(csvCell(3)).toBe('3');
  });
});
