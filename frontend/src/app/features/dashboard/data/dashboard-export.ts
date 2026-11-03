import { DashboardSummary } from './dashboard.models';
import { formatWidgetValue } from './widget-format';

const BOM = '﻿';

/** Quotes a CSV cell; also stops a cell from being read as a formula by a spreadsheet. */
function cell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(values: readonly (string | number)[]): string {
  return values.map(cell).join(',');
}

/**
 * CSV of the figures on screen (KPI, panels and trends) with the scope and the period. It is generated
 * in the browser from the summary already loaded; there is no PDF or Excel export of the dashboard.
 */
export function buildDashboardCsv(summary: DashboardSummary): string {
  const lines: string[] = [
    row(['Alcance', summary.scope.label]),
    row(['Periodo', `${summary.periodLabel} (${summary.range.from} a ${summary.range.to})`]),
    '',
    row(['Sección', 'Indicador', 'Valor', 'Detalle']),
  ];

  if (summary.hero) {
    const { hero } = summary;
    lines.push(row(['Principal', hero.label, formatWidgetValue(hero.value, hero.format), '']));
    if (hero.previous !== null) {
      lines.push(
        row(['Principal', `Anterior (${summary.previousLabel})`, formatWidgetValue(hero.previous, hero.format), '']),
      );
    }
  }
  for (const kpi of summary.kpis) {
    lines.push(row(['Indicadores', kpi.label, formatWidgetValue(kpi.value, kpi.format), kpi.hint ?? '']));
  }
  for (const panel of summary.panels) {
    for (const stat of panel.stats) {
      lines.push(row([panel.title, stat.label, formatWidgetValue(stat.value, stat.format), stat.meta ?? '']));
    }
  }
  for (const trend of summary.trends) {
    for (const point of trend.points) {
      lines.push(row([trend.title, point.label, formatWidgetValue(point.value, trend.format), '']));
    }
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export function dashboardCsvFilename(summary: DashboardSummary): string {
  return `resumen-${summary.period}-${summary.asOf}.csv`;
}
