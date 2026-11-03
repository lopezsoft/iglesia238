import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PERIOD_STATUS_LABELS } from '../../accounting/data/accounting.models';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { IconComponent } from '../../../shared/ui/icon.component';
import { FinancialReport } from '../data/reports.models';

function millions(value: number): string {
  return (value / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 });
}

/** "Ingresos y egresos por mes": CSS grouped bars plus the data table they draw. */
@Component({
  selector: 'app-monthly-flow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, MoneyPipe],
  templateUrl: './monthly-flow.component.html',
  styleUrl: './monthly-flow.component.scss',
})
export class MonthlyFlowComponent {
  readonly report = input.required<FinancialReport>();
  readonly exportCsv = output<void>();

  protected readonly periodLabels = PERIOD_STATUS_LABELS;

  protected readonly bars = computed(() => {
    const months = this.report().months;
    const max = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
    const percent = (value: number): number => Math.max(0, Math.round((value / max) * 100));
    return months.map((m) => ({
      key: `${m.year}-${m.month}`,
      shortLabel: m.shortLabel,
      incomeHeight: percent(m.income),
      expenseHeight: percent(m.expense),
      incomeShort: millions(m.income),
      expenseShort: millions(m.expense),
      incomeTitle: `${m.label} · ingresos`,
      expenseTitle: `${m.label} · egresos`,
    }));
  });

  protected readonly chartLabel = computed(() => {
    const months = this.report().months;
    const first = months[0]?.label ?? '';
    const last = months[months.length - 1]?.label ?? '';
    return `Gráfico de barras agrupadas de ingresos y egresos de ${first} a ${last}. El detalle está en la tabla siguiente.`;
  });
}
