import { MEMBER_STATUS_LABELS } from '../../../../core/models/membership.model';
import { MemberListItem, documentLabel } from './members.models';

const SEPARATOR = ';';
/** Cells starting with these characters run as formulas in spreadsheets (CSV injection). */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

interface CsvColumn {
  readonly header: string;
  readonly value: (row: MemberListItem) => string;
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

/**
 * CSV of the visible columns of the member list, separated by semicolons (Excel es-CO) and with a
 * BOM so accents open correctly.
 */
export function buildMembersCsv(
  rows: readonly MemberListItem[],
  includeCongregation: boolean,
): string {
  const columns: CsvColumn[] = [
    { header: 'Carné', value: (row) => row.code },
    { header: 'Nombre', value: (row) => row.fullName },
    {
      header: 'Documento',
      value: (row) =>
        row.documentNumber ? documentLabel(row.documentTypeCode, row.documentNumber) : '',
    },
    { header: 'Edad', value: (row) => (row.age === null ? '' : String(row.age)) },
    { header: 'Teléfono', value: (row) => row.phone ?? '' },
    { header: 'Fecha de ingreso', value: (row) => formatDate(row.joinedOn) },
    ...(includeCongregation
      ? [{ header: 'Sede', value: (row: MemberListItem) => row.congregationName }]
      : []),
    { header: 'Cargo', value: (row) => row.positions.join(', ') },
    { header: 'Estado', value: (row) => MEMBER_STATUS_LABELS[row.status] },
  ];
  const lines = [
    columns.map((column) => escapeCell(column.header)).join(SEPARATOR),
    ...rows.map((row) => columns.map((column) => escapeCell(column.value(row))).join(SEPARATOR)),
  ];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** File name with the date of the export, e.g. miembros-2026-11-02.csv. */
export function membersCsvFileName(today: string): string {
  return `miembros-${today}.csv`;
}
