import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { PaginationComponent } from '../../../../shared/ui/feedback.components';
import { BadgeTone, StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { paginate } from '../../../../shared/utils/pagination';
import {
  CASH_ROW_STATUS_LABELS,
  CashBookRow,
  CashPeriodOption,
  CashRowStatus,
  REVERSAL_BLOCK_LABELS,
} from '../data/cash-book.models';

const PAGE_SIZE = 15;

const STATUS_TONES: Readonly<Record<CashRowStatus, BadgeTone>> = {
  POSTED: 'success',
  REVERSED: 'danger',
  REVERSAL: 'info',
};

/** Movements of a fund in a period with the running balance; the opening row comes first. */
@Component({
  selector: 'app-cash-movements-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MoneyPipe, PaginationComponent, StatusBadgeComponent],
  styles: `
    .header {
      padding: 1.5rem 1.5rem 0;
    }
    .header h2 {
      margin: 0;
    }
    .account {
      display: flex;
      flex-direction: column;
    }
  `,
  template: `
    <section class="card card--flush" aria-labelledby="moves-title">
      <div class="card__header header">
        <div>
          <h2 id="moves-title">Movimientos · {{ fundName() }} · {{ period().label }}</h2>
          <p class="text-muted text-small">
            Solo las cuentas imputables del plan de cuentas reciben movimientos. Saldo calculado en orden de registro.
          </p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <caption class="visually-hidden">Movimientos del libro de caja de {{ fundName() }}, {{ period().label }}</caption>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Comprobante</th>
              <th scope="col">Cuenta</th>
              <th scope="col">Descripción</th>
              <th scope="col" class="text-right">Entrada</th>
              <th scope="col" class="text-right">Salida</th>
              <th scope="col" class="text-right">Saldo</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @if (pageNumber() === 1) {
              <tr>
                <td>{{ period().from | date: 'dd/MM/yyyy' }}</td>
                <td class="code">—</td>
                <td>—</td>
                <td>Saldo inicial del periodo</td>
                <td></td>
                <td></td>
                <td class="num">{{ opening() | money }}</td>
                <td></td>
                <td></td>
              </tr>
            }
            @for (row of page().items; track row.id) {
              <tr>
                <td>{{ row.postedOn | date: 'dd/MM/yyyy' }}</td>
                <td class="code">{{ row.voucherCode }}</td>
                <td>
                  <span class="account">
                    <span class="mono text-small">{{ row.accountCode }}</span>
                    <span>{{ row.accountName }}</span>
                  </span>
                </td>
                <td [class.text-muted]="row.status === 'REVERSED'">{{ row.description }}</td>
                <td class="num">{{ row.direction === 'IN' ? (row.amount | money) : '' }}</td>
                <td class="num">{{ row.direction === 'OUT' ? (row.amount | money) : '' }}</td>
                <td class="num">{{ row.balance | money }}</td>
                <td>
                  <app-status-badge [label]="statusLabels[row.status]" [tone]="statusTones[row.status]" />
                  @if (row.relatedVoucherCode) {
                    <div class="text-muted text-small">
                      {{ row.status === 'REVERSAL' ? 'De' : 'Con' }} <span class="mono">{{ row.relatedVoucherCode }}</span>
                    </div>
                  }
                </td>
                <td>
                  @if (row.reversalBlock; as block) {
                    <span class="text-muted text-small">{{ blockLabels[block] }}</span>
                  } @else {
                    <button
                      type="button"
                      class="btn btn--danger-ghost btn--sm"
                      [disabled]="!canReverse()"
                      [attr.aria-label]="'Reversar comprobante ' + row.voucherCode"
                      (click)="reverse.emit(row)"
                    >
                      Reversar
                    </button>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9" class="text-muted">Sin movimientos en el periodo.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-pagination [page]="pageNumber()" [pageSize]="pageSize" [total]="rows().length" (pageChange)="pageNumber.set($event)" />
    </section>
  `,
})
export class CashMovementsTableComponent {
  readonly rows = input.required<readonly CashBookRow[]>();
  readonly opening = input.required<number>();
  readonly period = input.required<CashPeriodOption>();
  readonly fundName = input.required<string>();
  readonly canReverse = input(false);
  readonly reverse = output<CashBookRow>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusLabels = CASH_ROW_STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;
  protected readonly blockLabels = REVERSAL_BLOCK_LABELS;
  protected readonly pageNumber = linkedSignal({ source: this.rows, computation: () => 1 });
  protected readonly page = computed(() => paginate(this.rows(), { page: this.pageNumber(), pageSize: PAGE_SIZE }));
}
