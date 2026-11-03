/**
 * CSV for spreadsheets in Colombian locale: semicolon separated, UTF-8 with BOM so Excel reads the
 * accents, plain numbers (no thousand separators) so the columns can be added up.
 */

const SEPARATOR = ';';
/** Byte order mark: tells Excel the file is UTF-8. */
export const CSV_BOM = String.fromCodePoint(0xfeff);
/** A cell starting with these characters runs as a formula in a spreadsheet (CSV injection). */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export type CsvCell = string | number | null | undefined;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) {
    return '';
  }
  if (typeof cell === 'number') {
    return String(cell);
  }
  const value = FORMULA_PREFIX.test(cell) ? `'${cell}` : cell;
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsvDocument(
  headers: readonly string[],
  rows: ReadonlyArray<readonly CsvCell[]>,
): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCell).join(SEPARATOR),
  );
  return `${CSV_BOM}${lines.join('\r\n')}\r\n`;
}

/** 2026-10-25 to 25/10/2026, the way people read dates in a spreadsheet. */
export function csvDate(isoDate: string | null | undefined): string {
  if (!isoDate) {
    return '';
  }
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
