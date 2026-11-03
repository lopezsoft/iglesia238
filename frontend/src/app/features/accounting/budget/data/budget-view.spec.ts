import { BudgetLineRow, BudgetView, cutoffLabel } from './budget.models';
import { budgetCsv, executionPct, filterLines, hasFilter, linesOfNature, totalsOf } from './budget-view';

function line(overrides: Partial<BudgetLineRow>): BudgetLineRow {
  return {
    id: 1,
    budgetId: 1,
    accountId: 1,
    accountCode: '510505',
    accountName: 'Servicios públicos',
    nature: 'EXPENSE',
    fundId: 1,
    fundName: 'Fondo Local',
    monthlyAmount: null,
    annualAmount: 1_000,
    executed: 500,
    executionPct: 50,
    overExecuted: false,
    difference: 500,
    sharedWith: [],
    ...overrides,
  };
}

const LINES = [
  line({ id: 1 }),
  line({ id: 2, accountCode: '410505', accountName: 'Diezmos', nature: 'INCOME', annualAmount: 5_000, executed: 1_000, monthlyAmount: 400 }),
  line({ id: 3, accountCode: '540510', accountName: 'Mantenimiento', fundName: 'Comité de Jóvenes', executed: 1_400, executionPct: 140, overExecuted: true, difference: -400 }),
];

describe('budget view helpers', () => {
  it('adds up the lines left after a filter', () => {
    expect(totalsOf(LINES)).toEqual({ annual: 7_000, monthly: 400, executed: 2_900, executionPct: 41.4, difference: 4_100 });
    expect(totalsOf([])).toEqual({ annual: 0, monthly: 0, executed: 0, executionPct: 0, difference: 0 });
    expect(executionPct(5, 0)).toBe(0);
  });

  it('filters by text ignoring accents and by over-execution', () => {
    expect(filterLines(LINES, { search: 'jovenes', onlyOverExecuted: false }).map((l) => l.id)).toEqual([3]);
    expect(filterLines(LINES, { search: '4105', onlyOverExecuted: false }).map((l) => l.id)).toEqual([2]);
    expect(filterLines(LINES, { search: '', onlyOverExecuted: true }).map((l) => l.id)).toEqual([3]);
    expect(filterLines(LINES, { search: '', onlyOverExecuted: false })).toHaveLength(3);
    expect(hasFilter({ search: '  ', onlyOverExecuted: false })).toBe(false);
    expect(hasFilter({ search: 'x', onlyOverExecuted: false })).toBe(true);
  });

  it('separates income from expense lines', () => {
    expect(linesOfNature(LINES, 'INCOME').map((l) => l.id)).toEqual([2]);
    expect(linesOfNature(LINES, 'EXPENSE').map((l) => l.id)).toEqual([1, 3]);
  });

  it('writes the CSV with separate income and expense totals', () => {
    const view: BudgetView = {
      type: 'FIXED',
      budgetId: 1,
      status: 'DRAFT',
      incomeIncreaseRate: null,
      lines: LINES,
      totals: totalsOf(LINES),
      incomeTotals: totalsOf(linesOfNature(LINES, 'INCOME')),
      expenseTotals: totalsOf(linesOfNature(LINES, 'EXPENSE')),
      groups: [],
    };

    const csv = budgetCsv(view, 2026, 'Fondo');

    expect(csv.startsWith('﻿Naturaleza;Código;Cuenta;Fondo;Valor anual;Valor mensual;Ejecutado real;% ejecución;Diferencia')).toBe(true);
    expect(csv).toContain('Egreso;510505;Servicios públicos;Fondo Local;1000;;500;50;500');
    expect(csv).toContain('Total ingresos 2026;;;;5000;400;1000;20;4000');
    expect(csv).toContain('Total egresos 2026;;;;2000;0;1900;95;100');
  });

  it('words the execution cutoff by the year being looked at', () => {
    expect(cutoffLabel(2025, '2026-11-02')).toBe('Ejecución real al cierre del 31/12/2025.');
    expect(cutoffLabel(2027, '2026-11-02')).toBe('El año aún no comienza: sin ejecución registrada.');
    expect(cutoffLabel(2026, '2026-11-02')).toBe('Ejecución real al 02/11/2026; esperada a la fecha: 10 de 12 meses cerrados.');
  });
});
