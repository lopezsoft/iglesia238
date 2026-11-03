import { accountsCsv, reportFileName, toCsv } from './report-csv';
import { FinancialReport, formatShare, formatVariation, variation } from './reports.models';

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
      reportFileName('saldos-por-fondo', { from: '2026-01-01', to: '2026-12-31', fundId: null, congregationId: null }),
    ).toBe('reporte-saldos-por-fondo-2026-01-01-a-2026-12-31.csv');
  });
});

describe('accounts CSV', () => {
  it('writes the income statement by account with its nature in Spanish', () => {
    const report = {
      accounts: [
        { accountId: 1, code: '410505', name: 'Diezmos', nature: 'INCOME', amount: 3000000 },
        { accountId: 2, code: '510505', name: '=Servicios', nature: 'EXPENSE', amount: 1200000 },
      ],
    } as unknown as FinancialReport;

    expect(accountsCsv(report)).toBe(
      '﻿Código;Cuenta;Naturaleza;Valor\r\n410505;Diezmos;Ingreso;3000000\r\n510505;\'=Servicios;Egreso;1200000\r\n',
    );
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
