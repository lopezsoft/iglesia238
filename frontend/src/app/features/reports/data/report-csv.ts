// CSV exports of the report tables: semicolon separated (Excel es-CO), BOM for accents, plain
// numbers without thousand separators so spreadsheets can add them up.
import { PERIOD_STATUS_LABELS } from '../../accounting/data/accounting.models';
import { FinancialReport, ReportQuery } from './reports.models';

const SEPARATOR = ';';
/** Cells starting with these characters run as formulas in spreadsheets (CSV injection). */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

type Cell = string | number;

function escapeCell(cell: Cell): string {
  if (typeof cell === 'number') {
    return String(cell);
  }
  const value = FORMULA_PREFIX.test(cell) ? `'${cell}` : cell;
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(headers: readonly string[], rows: ReadonlyArray<readonly Cell[]>): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(SEPARATOR));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function monthsCsv(report: FinancialReport): string {
  return toCsv(
    ['Mes', 'Ingresos', 'Egresos', 'Saldo del mes', 'Periodo de caja'],
    [
      ...report.months.map((m) => [
        m.label,
        m.income,
        m.expense,
        m.balance,
        m.periodStatus ? PERIOD_STATUS_LABELS[m.periodStatus] : 'Sin periodo',
      ]),
      ['Total', report.totals.income, report.totals.expense, report.totals.balance, ''],
    ],
  );
}

export function fundsCsv(report: FinancialReport): string {
  const sum = (pick: (row: FinancialReport['funds'][number]) => number): number =>
    report.funds.reduce((total, row) => total + pick(row), 0);
  return toCsv(
    ['Fondo', 'Saldo inicial', 'Entradas', 'Salidas', 'Saldo final'],
    [
      ...report.funds.map((f) => [f.name, f.opening, f.inflows, f.outflows, f.closing]),
      [
        'Total',
        sum((f) => f.opening),
        sum((f) => f.inflows),
        sum((f) => f.outflows),
        sum((f) => f.closing),
      ],
    ],
  );
}

export function contributionTypesCsv(report: FinancialReport): string {
  return toCsv(
    ['Tipo de aporte', 'Cantidad', 'Valor', 'Participación (%)'],
    [
      ...report.contributionTypes.map((t) => [
        t.name,
        t.count,
        t.amount,
        Math.round(t.share * 1000) / 10,
      ]),
      [
        'Total',
        report.contributionsCount,
        report.contributionsTotal,
        report.contributionsTotal > 0 ? 100 : 0,
      ],
    ],
  );
}

export function congregationsCsv(report: FinancialReport): string {
  return toCsv(
    ['Sede', 'Ingresos', 'Egresos', 'Saldo'],
    [
      ...(report.congregations ?? []).map((c) => [c.name, c.income, c.expense, c.balance]),
      ['Total', report.totals.income, report.totals.expense, report.totals.balance],
    ],
  );
}

export function accountsCsv(report: FinancialReport): string {
  return toCsv(
    ['Código', 'Cuenta', 'Naturaleza', 'Valor'],
    report.accounts.map((a) => [a.code, a.name, a.nature === 'INCOME' ? 'Ingreso' : 'Egreso', a.amount]),
  );
}

/** reporte-ingresos-egresos-2026-01-01-a-2026-12-31.csv */
export function reportFileName(table: string, query: ReportQuery): string {
  return `reporte-${table}-${query.from}-a-${query.to}.csv`;
}
