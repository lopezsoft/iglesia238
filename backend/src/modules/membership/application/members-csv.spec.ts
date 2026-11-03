import { buildMembersCsv, membersCsvFileName } from './members-csv.js';
import type { MemberListRow } from './member.models.js';

const ROW: MemberListRow = {
  id: 4,
  code: 'SC-0130',
  fullName: 'Ana María Rojas Díaz',
  sex: 'FEMALE',
  documentTypeCode: 'CC',
  documentNumber: '52418916',
  birthDate: '1989-01-01',
  phone: '300 555 1004',
  joinedOn: '2008-04-10',
  status: 'ACTIVE',
  congregationId: 1,
  congregationName: 'Sede Central',
  positions: ['Maestro(a) de escuela dominical'],
};

const ageOf = () => 37;

describe('buildMembersCsv', () => {
  it('writes the visible columns with a BOM and semicolons', () => {
    const [header, line] = buildMembersCsv([ROW], false, ageOf).split('\r\n');

    expect(header).toBe(
      '﻿Carné;Nombre;Documento;Edad;Teléfono;Fecha de ingreso;Cargo;Estado',
    );
    expect(line).toBe(
      'SC-0130;Ana María Rojas Díaz;CC 52418916;37;300 555 1004;10/04/2008;Maestro(a) de escuela dominical;Activo',
    );
  });

  it('adds the Sede column for the denomination-wide list', () => {
    const [header, line] = buildMembersCsv([ROW], true, ageOf).split('\r\n');

    expect(header).toContain('Fecha de ingreso;Sede;Cargo');
    expect(line).toContain('10/04/2008;Sede Central;');
  });

  it('quotes separators and neutralizes spreadsheet formulas', () => {
    const csv = buildMembersCsv(
      [
        {
          ...ROW,
          fullName: '=HYPERLINK("x")',
          positions: ['Diácono', 'Músico'],
          phone: null,
        },
      ],
      false,
      ageOf,
    );
    const line = csv.split('\r\n')[1];

    expect(line).toContain(`"'=HYPERLINK(""x"")"`);
    expect(line).toContain(';Diácono, Músico;');
    expect(line).toContain(';;10/04/2008');
  });

  it('names the file with the export date', () => {
    expect(membersCsvFileName('2026-11-02')).toBe('miembros-2026-11-02.csv');
  });
});
