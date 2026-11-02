import {
  addYears,
  buildCertificateSnapshot,
  certificateNumber,
  daysBetween,
  documentLabel,
  longDate,
} from './certificate-document';
import { MemberOption } from './certificates.models';

const MEMBER: MemberOption = {
  id: 4,
  fullName: 'Ana María Rojas Díaz',
  code: 'SC-0130',
  documentLabel: 'CC 52.418.916',
  joinedOn: '2008-04-10',
  isBaptized: true,
  waterBaptismOn: '2009-04-12',
};

describe('certificate document rules', () => {
  it('formats the number as CERT-<CODE>-<YEAR>-<NNNN>', () => {
    expect(certificateNumber('MEM', 2026, 32)).toBe('CERT-MEM-2026-0032');
  });

  it('adds whole years and handles 29 February', () => {
    expect(addYears('2026-11-02', 2)).toBe('2028-11-02');
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28');
  });

  it('counts days between ISO dates', () => {
    expect(daysBetween('2026-11-02', '2026-11-24')).toBe(22);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(-2);
  });

  it('writes dates and documents like the printed certificate', () => {
    expect(longDate('2026-11-02')).toBe('2 de noviembre de 2026');
    expect(documentLabel('CC', '52418916')).toBe('CC 52.418.916');
    expect(documentLabel('PAS', 'AB12345')).toBe('PAS AB12345');
  });

  it('builds the body from the member data and the type', () => {
    const snapshot = buildCertificateSnapshot({
      number: 'CERT-BAU-2026-0015',
      typeCode: 'BAU',
      typeName: 'Certificado de bautismo',
      issuedOn: '2026-11-02',
      letterhead: {
        denominationName: 'Iglesia Cristiana Monte de Sion',
        legalName: 'Iglesia Cristiana Monte de Sion',
        taxId: '900.123.456-7',
        congregationName: 'Sede Central',
        cityName: 'Bogotá, D.C.',
        locationLine: 'Sede Central · Bogotá, D.C. · Distrito 1',
      },
      signers: { pastorName: 'Pastor Daniel Herrera', secretaryName: 'Marta Castillo' },
      issuedByName: 'Marta Castillo',
      member: MEMBER,
      notes: '  ',
    });

    expect(snapshot.title).toBe('CERTIFICADO DE BAUTISMO');
    expect(snapshot.body).toContain('recibió el bautismo en agua el 12 de abril de 2009');
    expect(snapshot.body).toContain('de la Sede Central');
    expect(snapshot.notes).toBeNull();
    expect(snapshot.closing).toBe(
      'Se expide en Bogotá, D.C., el 2 de noviembre de 2026, a solicitud del interesado(a).',
    );
  });
});
