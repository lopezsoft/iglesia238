import {
  buildCertificateSnapshot,
  DEFAULT_TEXT_HINTS,
  PLACEHOLDER_DESCRIPTIONS,
  TEMPLATE_PLACEHOLDERS,
  templateProblems,
  type SnapshotInput,
} from './certificate-document.js';

const BASE: SnapshotInput = {
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
    waterBaptismOn: '2009-04-12',
  },
  notes: null,
};

describe('customized texts of a certificate type', () => {
  it('prints the default texts when nothing is customized', () => {
    const snapshot = buildCertificateSnapshot(BASE);

    expect(snapshot.intro).toBe(
      'La Secretaría de la Sede Central hace constar',
    );
    expect(snapshot.closing).toBe(
      'Se expide en Bogotá, D.C., el 2 de noviembre de 2026, a solicitud del interesado(a).',
    );
    expect(snapshot.pastorTitle).toBe('Pastor(a), Sede Central');
    expect(snapshot.secretaryTitle).toBe('Secretario(a), Sede Central');
  });

  it('renders a customized intro, closing and signer titles with the placeholders', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      introTemplate: 'La {{denomination}} hace constar ante quien corresponda',
      closingTemplate: 'Dado en {{city}}, el {{issuedOn}}.',
      pastorTitleTemplate: 'Pastor titular de {{congregation}}',
      secretaryTitleTemplate: 'Secretaría de {{sede}}',
    });

    expect(snapshot.intro).toBe(
      'La Iglesia Cristiana Monte de Sion hace constar ante quien corresponda',
    );
    expect(snapshot.closing).toBe(
      'Dado en Bogotá, D.C., el 2 de noviembre de 2026.',
    );
    expect(snapshot.pastorTitle).toBe('Pastor titular de Sede Central');
    expect(snapshot.secretaryTitle).toBe('Secretaría de la Sede Central');
  });

  it('offers the signer names and the issue date to the body too', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      template:
        '{{memberName}} ({{memberCode}}) fue certificado(a) por {{pastorName}} y {{secretaryName}} el {{issuedOn}} en {{denomination}}, {{city}}.',
    });

    expect(snapshot.body).toBe(
      'Ana María Rojas Díaz (SC-0130) fue certificado(a) por Pastor Daniel Herrera y Marta Castillo el 2 de noviembre de 2026 en Iglesia Cristiana Monte de Sion, Bogotá, D.C..',
    );
  });

  it('falls back on the default for blank texts and for texts that render to nothing', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      letterhead: { ...BASE.letterhead, cityName: '' },
      introTemplate: '   ',
      closingTemplate: '{{city}}',
      pastorTitleTemplate: null,
      secretaryTitleTemplate: '',
    });

    expect(snapshot.intro).toBe(
      'La Secretaría de la Sede Central hace constar',
    );
    expect(snapshot.closing).toBe(
      'Se expide el 2 de noviembre de 2026, a solicitud del interesado(a).',
    );
    expect(snapshot.pastorTitle).toBe('Pastor(a), Sede Central');
    expect(snapshot.secretaryTitle).toBe('Secretario(a), Sede Central');
  });

  it('leaves unknown placeholders empty instead of printing the braces', () => {
    const snapshot = buildCertificateSnapshot({
      ...BASE,
      introTemplate: 'Hace constar {{nope}} que',
    });

    expect(snapshot.intro).toBe('Hace constar que');
  });
});

describe('templateProblems', () => {
  it('accepts every known placeholder, with or without inner spaces', () => {
    const text = TEMPLATE_PLACEHOLDERS.map((key, index) =>
      index % 2 === 0 ? `{{${key}}}` : `{{ ${key} }}`,
    ).join(' ');

    expect(templateProblems(text)).toEqual({ unknown: [], malformed: false });
  });

  it('reports the placeholders that do not exist, once each', () => {
    expect(
      templateProblems('{{foo}} {{memberName}} {{foo}} {{bar_1}}'),
    ).toEqual({
      unknown: ['foo', 'bar_1'],
      malformed: false,
    });
  });

  it('reports braces that do not form a placeholder', () => {
    expect(templateProblems('Hola {{memberName').malformed).toBe(true);
    expect(templateProblems('Hola memberName}}').malformed).toBe(true);
    expect(templateProblems('Hola {{ }}').malformed).toBe(true);
    expect(templateProblems('Hola {{member name}}').malformed).toBe(true);
  });

  it('has a description for every placeholder and a hint for every default text', () => {
    for (const key of TEMPLATE_PLACEHOLDERS) {
      expect(PLACEHOLDER_DESCRIPTIONS[key]).toBeTruthy();
    }
    expect(Object.keys(DEFAULT_TEXT_HINTS).sort()).toEqual([
      'closing',
      'intro',
      'pastorTitle',
      'secretaryTitle',
    ]);
    for (const hint of Object.values(DEFAULT_TEXT_HINTS)) {
      expect(templateProblems(hint)).toEqual({ unknown: [], malformed: false });
    }
  });
});
