import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { IconComponent } from '../../../shared/ui/icon.component';
import { FinancialReport, ReportCongregation } from '../data/reports.models';

/** Denomination-wide scope: income, expense and balance of each sede. */
@Component({
  selector: 'app-congregation-breakdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, MoneyPipe],
  styleUrl: './report-section.scss',
  template: `
    <section class="card" aria-labelledby="sedes-title">
      <header class="card__header">
        <div>
          <h2 id="sedes-title" class="section-title">Resultados por sede</h2>
          <p class="text-muted text-small">
            {{ report().fundLabel }} · todas las sedes de la denominación
          </p>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" (click)="exportCsv.emit()">
          <app-icon name="download" />
          Exportar CSV
        </button>
      </header>
      <div class="table-wrap">
        <table class="table">
          <caption class="visually-hidden">
            Ingresos, egresos y saldo por sede
          </caption>
          <thead>
            <tr>
              <th scope="col">Sede</th>
              <th scope="col" class="text-right">Ingresos</th>
              <th scope="col" class="text-right">Egresos</th>
              <th scope="col" class="text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            @for (sede of congregations(); track sede.congregationId) {
              <tr>
                <th scope="row">{{ sede.name }}</th>
                <td class="num">{{ sede.income | money }}</td>
                <td class="num">{{ sede.expense | money }}</td>
                <td class="num">{{ sede.balance | money }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="num">{{ report().totals.income | money }}</td>
              <td class="num">{{ report().totals.expense | money }}</td>
              <td class="num">{{ report().totals.balance | money }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  `,
})
export class CongregationBreakdownComponent {
  readonly report = input.required<FinancialReport>();
  readonly congregations = input.required<readonly ReportCongregation[]>();
  readonly exportCsv = output<void>();
}
