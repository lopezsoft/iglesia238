import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { FinancialReport } from '../data/reports.models';

/** "Saldos por fondo": closing = opening + inflows − outflows for the range. */
@Component({
  selector: 'app-fund-balances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, MoneyPipe, ReadOnlyNoticeComponent, RouterLink],
  styleUrl: './report-section.scss',
  template: `
    <section class="card" aria-labelledby="funds-title">
      <header class="card__header">
        <div>
          <h2 id="funds-title" class="section-title">Saldos por fondo</h2>
          <p class="text-muted text-small">
            Del {{ report().query.from | date: 'dd/MM/yyyy' }} al
            {{ report().query.to | date: 'dd/MM/yyyy' }}
            · saldo final = inicial + entradas − salidas
          </p>
        </div>
        <div class="cluster">
          <span class="badge">Resumen agregado</span>
          <button type="button" class="btn btn--secondary btn--sm" (click)="exportCsv.emit()">
            <app-icon name="download" />
            Exportar CSV
          </button>
        </div>
      </header>
      <div class="table-wrap">
        <table class="table">
          <caption class="visually-hidden">
            Saldo inicial, entradas, salidas y saldo final por fondo
          </caption>
          <thead>
            <tr>
              <th scope="col">Fondo</th>
              <th scope="col" class="text-right">Saldo inicial</th>
              <th scope="col" class="text-right">Entradas</th>
              <th scope="col" class="text-right">Salidas</th>
              <th scope="col" class="text-right">Saldo final</th>
            </tr>
          </thead>
          <tbody>
            @for (fund of report().funds; track fund.fundId) {
              <tr>
                <th scope="row">{{ fund.name }}</th>
                <td class="num">{{ fund.opening | money }}</td>
                <td class="num">{{ fund.inflows | money }}</td>
                <td class="num">{{ fund.outflows | money }}</td>
                <td class="num">{{ fund.closing | money }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="text-muted">No hay fondos con movimientos en el periodo.</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td class="num">{{ totals().opening | money }}</td>
              <td class="num">{{ totals().inflows | money }}</td>
              <td class="num">{{ totals().outflows | money }}</td>
              <td class="num">{{ totals().closing | money }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="section-footer">
        @if (canOpenCashBook()) {
          <a routerLink="/accounting/cash-book" class="text-small"
            >Ver comprobantes y movimientos en el Libro de caja</a
          >
        } @else {
          <app-read-only-notice
            permission="cash-transactions.write"
            detail="Los comprobantes y movimientos individuales se consultan en Libro de caja (Tesorería)."
          />
        }
      </div>
    </section>
  `,
})
export class FundBalancesComponent {
  readonly report = input.required<FinancialReport>();
  readonly canOpenCashBook = input(false);
  readonly exportCsv = output<void>();

  protected readonly totals = computed(() =>
    this.report().funds.reduce(
      (sum, f) => ({
        opening: sum.opening + f.opening,
        inflows: sum.inflows + f.inflows,
        outflows: sum.outflows + f.outflows,
        closing: sum.closing + f.closing,
      }),
      { opening: 0, inflows: 0, outflows: 0, closing: 0 },
    ),
  );
}
