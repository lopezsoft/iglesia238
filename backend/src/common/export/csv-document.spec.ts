import { CSV_BOM, csvDate, toCsvDocument } from './csv-document.js';

describe('toCsvDocument', () => {
  it('separates with semicolons, starts with a BOM and ends each line with CRLF', () => {
    const csv = toCsvDocument(['Fecha', 'Valor'], [['02/11/2026', 250000]]);

    expect(csv).toBe(`${CSV_BOM}Fecha;Valor\r\n02/11/2026;250000\r\n`);
  });

  it('quotes cells with separators, quotes and line breaks', () => {
    const csv = toCsvDocument(
      ['Nota'],
      [['a;b'], ['dice "hola"'], ['uno\ndos']],
    );

    expect(csv).toContain('"a;b"');
    expect(csv).toContain('"dice ""hola"""');
    expect(csv).toContain('"uno\ndos"');
  });

  it('neutralizes cells that would run as formulas', () => {
    const csv = toCsvDocument(
      ['Nota'],
      [['=HYPERLINK("x")'], ['+1'], ['@cmd']],
    );

    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain(`'+1`);
    expect(csv).toContain(`'@cmd`);
  });

  it('writes empty cells for null and undefined', () => {
    expect(toCsvDocument(['A', 'B'], [[null, undefined]])).toBe(
      `${CSV_BOM}A;B\r\n;\r\n`,
    );
  });
});

describe('csvDate', () => {
  it('formats ISO dates day first', () => {
    expect(csvDate('2026-10-25')).toBe('25/10/2026');
    expect(csvDate('2026-10-25T10:00:00.000Z')).toBe('25/10/2026');
    expect(csvDate(null)).toBe('');
  });
});
