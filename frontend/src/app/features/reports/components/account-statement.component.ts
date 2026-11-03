import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { IconComponent } from '../../../shared/ui/icon.component';
import { FinancialReport, ReportAccount } from '../data/reports.models';

/** "Estado de resultados por cuenta": what each income and expense account added in the range. */
@Component({
  selector: 'app-account-statement',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, MoneyPipe],
  styleUrl: './report-section.scss',
  template: `
    <section class="card" aria-labelledby="accounts-title">
      <header class="card__header">
        <div>
          <h2 id="accounts-title" class="section-title">Estado de resultados por cuenta</h2>
          <p class="text-muted text-small">
            Del {{ report().query.from | date: 'dd/MM/yyyy' }} al {{ report().query.to | date: 'dd/MM/yyyy' }} · las reversas
            descuentan de la cuenta que corrigen
          </p>
        </div>
        <button type="button" class="btn btn--secondary btn--sm" (click)="exportCsv.emit()">
          <app-icon name="download" />
          Exportar CSV
        </button>
      </header>
      @if (report().accounts.length === 0) {
        <p class="text-muted">No hay movimientos de caja en el periodo.</p>
      } @else {
        @for (group of groups(); track group.key) {
          @if (group.rows.length > 0) {
            <div class="table-wrap">
              <table class="table">
                <caption class="visually-hidden">
                  {{ group.title }} del periodo por cuenta
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">{{ group.title }}</th>
                    <th scope="col" class="text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of group.rows; track row.accountId) {
                    <tr>
                      <td class="code">{{ row.code }}</td>
                      <td>{{ row.name }}</td>
                      <td class="num">{{ row.amount | money }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="2">Total {{ group.title.toLowerCase() }}</td>
                    <td class="num">{{ group.total | money }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          }
        }
        <p class="result text-small">
          Resultado del periodo (ingresos − egresos): <strong class="amount">{{ report().totals.balance | money }}</strong>
        </p>
      }
    </section>
  `,
})
export class AccountStatementComponent {
  readonly report = input.required<FinancialReport>();
  readonly exportCsv = output<void>();

  protected readonly groups = computed(() => {
    const accounts = this.report().accounts;
    const of = (nature: ReportAccount['nature']) => accounts.filter((account) => account.nature === nature);
    const total = (rows: readonly ReportAccount[]) => Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    const income = of('INCOME');
    const expense = of('EXPENSE');
    return [
      { key: 'income', title: 'Ingresos', rows: income, total: total(income) },
      { key: 'expense', title: 'Egresos', rows: expense, total: total(expense) },
    ];
  });
}
