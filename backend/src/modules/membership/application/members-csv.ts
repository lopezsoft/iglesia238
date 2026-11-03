import { MemberListRow, MemberStatus } from './member.models.js';

const SEPARATOR = ';';
/** Byte order mark: makes Excel open the file as UTF-8, so accents survive. */
const BOM = '\uFEFF';
/** Cells starting with these characters run as formulas in spreadsheets (CSV injection). */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export const MEMBER_STATUS_LABELS: Readonly<Record<MemberStatus, string>> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  TRANSFERRED: 'Trasladado',
  DECEASED: 'Fallecido',
};

interface CsvColumn {
  readonly header: string;
  readonly value: (row: MemberListRow) => string;
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function escapeCell(raw: string): string {
  const value = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function documentLabel(row: MemberListRow): string {
  if (!row.documentNumber) {
    return '';
  }
  return row.documentTypeCode
    ? `${row.documentTypeCode} ${row.documentNumber}`
    : row.documentNumber;
}

/**
 * CSV of the member list, separated by semicolons (Excel es-CO) and with a BOM so accents open
 * correctly. `ageOf` turns the birth date into the age shown in the file.
 */
export function buildMembersCsv(
  rows: readonly MemberListRow[],
  includeCongregation: boolean,
  ageOf: (birthDate: string | null) => number | null,
): string {
  const columns: CsvColumn[] = [
    { header: 'Carné', value: (row) => row.code },
    { header: 'Nombre', value: (row) => row.fullName },
    { header: 'Documento', value: documentLabel },
    {
      header: 'Edad',
      value: (row) => String(ageOf(row.birthDate) ?? ''),
    },
    { header: 'Teléfono', value: (row) => row.phone ?? '' },
    { header: 'Fecha de ingreso', value: (row) => formatDate(row.joinedOn) },
    ...(includeCongregation
      ? [
          {
            header: 'Sede',
            value: (row: MemberListRow) => row.congregationName,
          },
        ]
      : []),
    { header: 'Cargo', value: (row) => row.positions.join(', ') },
    { header: 'Estado', value: (row) => MEMBER_STATUS_LABELS[row.status] },
  ];
  const lines = [
    columns.map((column) => escapeCell(column.header)).join(SEPARATOR),
    ...rows.map((row) =>
      columns.map((column) => escapeCell(column.value(row))).join(SEPARATOR),
    ),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** File name with the date of the export, e.g. miembros-2026-11-02.csv. */
export function membersCsvFileName(today: string): string {
  return `miembros-${today}.csv`;
}
