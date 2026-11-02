import { reportFileName, toCsv } from './report-csv';
import { formatShare, formatVariation, variation } from './reports.models';

describe('report CSV', () => {
  it('writes a BOM, semicolons and CRLF lines', () => {
    const csv = toCsv(['Mes', 'Ingresos'], [['Octubre 2026', 1250000]]);
    expect(csv).toBe('﻿Mes;Ingresos\r\nOctubre 2026;1250000\r\n');
  });

  it('quotes separators and neutralizes spreadsheet formulas', () => {
    const csv = toCsv(['Nota'], [['a;b'], ['=HYPERLINK("x")'], ['dice "hola"']]);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toBe('"a;b"');
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")"`);
    expect(lines[3]).toBe('"dice ""hola"""');
  });

  it('names files after the table and the range', () => {
    expect(
      reportFileName('saldos-por-fondo', { from: '2026-01-01', to: '2026-12-31', fundId: null }),
    ).toBe('reporte-saldos-por-fondo-2026-01-01-a-2026-12-31.csv');
  });
});

describe('report formatting', () => {
  it('formats variations and shares in es-CO', () => {
    expect(variation(105, 100)).toBeCloseTo(0.05);
    expect(variation(10, 0)).toBeNull();
    expect(formatVariation(0.051)).toBe('+5,1 %');
    expect(formatVariation(-0.02)).toBe('−2,0 %');
    expect(formatVariation(null)).toBe('—');
    expect(formatShare(0.6013)).toBe('60,1 %');
  });
});
