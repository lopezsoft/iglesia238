// Presentation helpers over the lines the API returns: they never recompute the execution (the
// server owns it); they only add up what is shown after a local filter, and write the CSV.
import { toCsv } from '../../../reports/data/report-csv';
import { BudgetLineRow, BudgetTotals, BudgetView } from './budget.models';

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** executed / annual × 100 with one decimal; 0 without an annual amount. */
export function executionPct(executed: number, annual: number): number {
  return annual > 0 ? Math.round((executed / annual) * 1000) / 10 : 0;
}

/** Totals of the lines left after the local filters. */
export function totalsOf(lines: readonly BudgetLineRow[]): BudgetTotals {
  const annual = round2(lines.reduce((sum, line) => sum + line.annualAmount, 0));
  const executed = round2(lines.reduce((sum, line) => sum + line.executed, 0));
  return {
    annual,
    monthly: round2(lines.reduce((sum, line) => sum + (line.monthlyAmount ?? 0), 0)),
    executed,
    executionPct: executionPct(executed, annual),
    difference: round2(annual - executed),
  };
}

export interface LineFilter {
  /** Text in the code, the name or the fund of the line. */
  readonly search: string;
  readonly onlyOverExecuted: boolean;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

export function filterLines(lines: readonly BudgetLineRow[], filter: LineFilter): BudgetLineRow[] {
  const needle = normalize(filter.search);
  return lines.filter(
    (line) =>
      (!filter.onlyOverExecuted || line.overExecuted) &&
      (needle === '' || normalize(`${line.accountCode} ${line.accountName} ${line.fundName}`).includes(needle)),
  );
}

export function hasFilter(filter: LineFilter): boolean {
  return filter.search.trim() !== '' || filter.onlyOverExecuted;
}

/** Lines of a view by nature, in the order the server sent them. */
export function linesOfNature(lines: readonly BudgetLineRow[], nature: 'INCOME' | 'EXPENSE'): BudgetLineRow[] {
  return lines.filter((line) => line.nature === nature);
}

export function budgetCsv(view: BudgetView, year: number, fundHeader: string): string {
  return toCsv(
    ['Naturaleza', 'Código', 'Cuenta', fundHeader, 'Valor anual', 'Valor mensual', 'Ejecutado real', '% ejecución', 'Diferencia'],
    [
      ...view.lines.map((line) => [
        line.nature === 'INCOME' ? 'Ingreso' : 'Egreso',
        line.accountCode,
        line.accountName,
        line.fundName,
        line.annualAmount,
        line.monthlyAmount ?? '',
        line.executed,
        line.executionPct,
        line.difference,
      ]),
      totalRow(`Total ingresos ${year}`, view.incomeTotals),
      totalRow(`Total egresos ${year}`, view.expenseTotals),
    ],
  );
}

function totalRow(label: string, totals: BudgetTotals): (string | number)[] {
  return [label, '', '', '', totals.annual, totals.monthly, totals.executed, totals.executionPct, totals.difference];
}
