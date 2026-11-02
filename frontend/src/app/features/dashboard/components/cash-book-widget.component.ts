import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../shared/pipes/money.pipe';
import { CashBookOverview } from '../data/dashboard.models';

/** cash-transactions.write: the open period and the current balance of each fund. */
@Component({
  selector: 'app-cash-book-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, RouterLink],
  styleUrl: './dashboard-widget.scss',
  template: `
    <section class="card card--flush" aria-labelledby="cash-title">
      <header class="widget__header">
        <div>
          <h2 id="cash-title">Libro de caja</h2>
          <p class="text-muted text-small">
            @if (overview().openPeriodLabel; as period) {
              Periodo abierto: <strong>{{ period }}</strong>
            } @else {
              Sin periodo abierto en este alcance
            }
          </p>
        </div>
        <a class="btn btn--secondary btn--sm" routerLink="/accounting/cash-book"
          >Ir al libro de caja</a
        >
      </header>
      <div class="table-wrap">
        <table class="table">
          <caption class="visually-hidden">
            Saldo actual por fondo
          </caption>
          <thead>
            <tr>
              <th scope="col">Fondo</th>
              <th scope="col" class="text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            @for (fund of overview().funds; track fund.fundId) {
              <tr>
                <th scope="row">{{ fund.name }}</th>
                <td class="num">{{ fund.balance | money }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="2" class="text-muted">No hay fondos activos.</td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr>
              <td>Total en fondos</td>
              <td class="num">{{ overview().totalBalance | money }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  `,
})
export class CashBookWidgetComponent {
  readonly overview = input.required<CashBookOverview>();
}
