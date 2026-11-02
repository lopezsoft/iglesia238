import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { PaginationComponent } from '../../../../shared/ui/feedback.components';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { paginate } from '../../../../shared/utils/pagination';
import { SETTLEMENT_STATUS_LABELS, TitheSettlementRow } from '../data/tithe-settlements.models';

const PAGE_SIZE = 10;

/** History of the sede: settlements are never deleted, a voided one keeps its reason. */
@Component({
  selector: 'app-settlement-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MoneyPipe, PaginationComponent, StatusBadgeComponent],
  styles: `
    .header {
      padding: 1.5rem 1.5rem 0;
    }
    .header h2,
    .header p {
      margin: 0;
    }
  `,
  template: `
    <section class="card card--flush" aria-labelledby="history-title">
      <div class="card__header header">
        <div>
          <h2 id="history-title">Historial de liquidaciones</h2>
          <p class="text-muted text-small">Las liquidaciones no se eliminan: una anulación conserva el registro y su motivo.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <caption class="visually-hidden">Historial de liquidaciones del diezmo de {{ congregationName() }}</caption>
          <thead>
            <tr>
              <th scope="col">Número</th>
              <th scope="col">Rango</th>
              <th scope="col" class="text-right">Diezmos</th>
              <th scope="col" class="text-right">Bruto</th>
              <th scope="col">Fecha</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of page().items; track row.id) {
              <tr [class.is-selected]="row.id === highlightId()">
                <td class="code">{{ row.number }}</td>
                <td>{{ row.coveredFrom | date: 'dd/MM/yyyy' }} – {{ row.coveredTo | date: 'dd/MM/yyyy' }}</td>
                <td class="num">{{ row.status === 'ISSUED' ? row.contributionCount : '—' }}</td>
                <td class="num" [class.text-muted]="row.status === 'VOIDED'">{{ row.grossTithe | money }}</td>
                <td>{{ row.settledOn | date: 'dd/MM/yyyy' }}</td>
                <td>
                  <app-status-badge [label]="labels[row.status]" [tone]="row.status === 'ISSUED' ? 'success' : 'danger'" />
                  @if (row.voidReason) {
                    <div class="text-muted text-small">Motivo: {{ row.voidReason }}</div>
                  }
                </td>
                <td>
                  @if (row.status === 'ISSUED') {
                    <button
                      type="button"
                      class="btn btn--danger-ghost btn--sm"
                      [disabled]="!canVoid()"
                      [attr.aria-label]="'Anular liquidación ' + row.number"
                      (click)="voidRequested.emit(row)"
                    >
                      Anular
                    </button>
                  } @else {
                    <span class="text-muted text-small">Sin acciones</span>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="text-muted">Aún no hay liquidaciones en la sede.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-pagination [page]="pageNumber()" [pageSize]="pageSize" [total]="rows().length" (pageChange)="pageNumber.set($event)" />
    </section>
  `,
})
export class SettlementHistoryComponent {
  readonly rows = input.required<readonly TitheSettlementRow[]>();
  readonly congregationName = input.required<string>();
  readonly canVoid = input(false);
  readonly highlightId = input<number | null>(null);
  readonly voidRequested = output<TitheSettlementRow>();

  protected readonly labels = SETTLEMENT_STATUS_LABELS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly pageNumber = linkedSignal({ source: this.rows, computation: () => 1 });
  protected readonly page = computed(() => paginate(this.rows(), { page: this.pageNumber(), pageSize: PAGE_SIZE }));
}
