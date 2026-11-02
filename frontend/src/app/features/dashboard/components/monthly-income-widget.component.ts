import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { MonthlyIncomeOverview } from '../data/dashboard.models';

/** contributions.read: income of the month by category and the six-month trend. */
@Component({
  selector: 'app-monthly-income-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, ReadOnlyNoticeComponent, RouterLink],
  styleUrl: './monthly-income-widget.component.scss',
  template: `
    <section class="card" aria-labelledby="income-title">
      <header class="card__header">
        <div>
          <h2 id="income-title">Aportes de {{ overview().monthLabel }}</h2>
          <p class="text-muted text-small">{{ scopeLabel() }} · aportes vigentes (sin anulados)</p>
        </div>
        @if (canOpenReports()) {
          <a class="btn btn--ghost btn--sm" routerLink="/reports">Ver reporte</a>
        }
      </header>

      @if (overview().byCategory.length === 0) {
        <p class="text-muted">Aún no hay aportes registrados este mes.</p>
      } @else {
        <dl class="income__categories">
          @for (category of overview().byCategory; track category.label) {
            <div>
              <dt>{{ category.label }}</dt>
              <dd class="amount">{{ category.amount | money }}</dd>
            </div>
          }
          <div class="income__total">
            <dt>Total del mes</dt>
            <dd class="amount">{{ overview().total | money }}</dd>
          </div>
        </dl>
      }

      <h3 class="income__subtitle">Aportes por mes</h3>
      <div class="income__chart" aria-hidden="true">
        @for (bar of bars(); track bar.label) {
          <div class="income__column">
            <div class="income__track">
              <span class="income__value">{{ bar.shortValue }}</span>
              <span
                class="income__bar"
                [class.income__bar--current]="bar.current"
                [style.height.%]="bar.height"
              ></span>
            </div>
            <span class="income__label">{{ bar.shortLabel }}</span>
          </div>
        }
      </div>
      <div class="table-wrap">
        <table class="table">
          <caption class="visually-hidden">
            Aportes por mes de
            {{
              scopeLabel()
            }}, últimos seis meses
          </caption>
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col" class="text-right">Total de aportes</th>
            </tr>
          </thead>
          <tbody>
            @for (bar of bars(); track bar.label) {
              <tr>
                <th scope="row">{{ bar.label }}</th>
                <td class="num">{{ bar.total | money }}</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td>Total del semestre</td>
              <td class="num">{{ trendTotal() | money }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="text-muted text-small income__note">Valores de las barras en millones de pesos.</p>

      @if (readOnly()) {
        <app-read-only-notice
          permission="contributions.write"
          detail="Los aportes los registra Tesorería."
        />
      }
    </section>
  `,
})
export class MonthlyIncomeWidgetComponent {
  readonly overview = input.required<MonthlyIncomeOverview>();
  readonly scopeLabel = input.required<string>();
  readonly readOnly = input(false);
  readonly canOpenReports = input(false);

  protected readonly bars = computed(() => {
    const trend = this.overview().trend;
    const max = Math.max(...trend.map((month) => month.total), 1);
    return trend.map((month, index) => ({
      ...month,
      current: index === trend.length - 1,
      height: Math.round((month.total / max) * 100),
      shortValue: (month.total / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 2 }),
    }));
  });

  protected readonly trendTotal = computed(() =>
    this.overview().trend.reduce((sum, month) => sum + month.total, 0),
  );
}
