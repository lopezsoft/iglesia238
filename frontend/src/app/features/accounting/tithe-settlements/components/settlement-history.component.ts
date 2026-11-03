import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { ErrorBannerComponent, LoadingComponent, PaginationComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { TitheSettlementStatus } from '../../data/accounting.models';
import { SETTLEMENT_STATUS_LABELS, SettlementQuery, TitheSettlementRow } from '../data/tithe-settlements.models';
import { TitheSettlementsRepository } from '../data/tithe-settlements.repository';

const PAGE_SIZE = 10;

/** History of the sede, paginated and filtered by the server: settlements are never deleted, a voided one keeps its reason. */
@Component({
  selector: 'app-settlement-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ErrorBannerComponent, IconComponent, LoadingComponent, MoneyPipe, PaginationComponent, StatusBadgeComponent],
  styles: `
    @use 'tokens' as *;
    .header {
      padding: $space-5 $space-5 0;
      margin-bottom: $space-3;
    }
    .header h2,
    .header p {
      margin: 0;
    }
    .filters {
      padding: 0 $space-5 $space-4;
    }
    .filters .field {
      flex: 0 1 11rem;
    }
    .row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: $space-1;
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
      <div class="toolbar filters">
        <div class="field">
          <label for="history-status">Estado</label>
          <select id="history-status" class="select" (change)="setStatus($event)">
            <option value="">Todos</option>
            <option value="ISSUED">{{ labels.ISSUED }}</option>
            <option value="VOIDED">{{ labels.VOIDED }}</option>
          </select>
        </div>
        <div class="field">
          <label for="history-from">Liquidadas desde</label>
          <input id="history-from" class="input" type="date" [value]="from() ?? ''" (change)="setFrom($event)" />
        </div>
        <div class="field">
          <label for="history-to">Hasta</label>
          <input id="history-to" class="input" type="date" [value]="to() ?? ''" (change)="setTo($event)" />
        </div>
        @if (hasFilters()) {
          <button type="button" class="btn btn--ghost" (click)="clear()">Quitar filtros</button>
        }
      </div>
      @if (history.error(); as error) {
        <div class="filters"><app-error-banner [message]="errorMessage(error)" (retry)="history.reload()" /></div>
      } @else if (!history.hasValue()) {
        <div class="filters"><app-loading label="Cargando historial…" /></div>
      } @else {
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
                    <div class="row-actions">
                      <button
                        type="button"
                        class="btn btn--ghost btn--sm"
                        [attr.aria-label]="'Ver detalle de la liquidación ' + row.number"
                        (click)="detailRequested.emit(row)"
                      >
                        <app-icon name="eye" [size]="16" />
                        Detalle
                      </button>
                      @if (row.status === 'ISSUED' && canVoid()) {
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          [attr.aria-label]="'Anular liquidación ' + row.number"
                          (click)="voidRequested.emit(row)"
                        >
                          Anular
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="text-muted">
                    {{ hasFilters() ? 'Ninguna liquidación coincide con los filtros.' : 'Aún no hay liquidaciones en la sede.' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="pageNumber()" [pageSize]="pageSize" [total]="page().total" (pageChange)="pageNumber.set($event)" />
      }
    </section>
  `,
})
export class SettlementHistoryComponent {
  private readonly repository = inject(TitheSettlementsRepository);

  readonly congregationName = input.required<string>();
  readonly canVoid = input(false);
  readonly highlightId = input<number | null>(null);
  /** Changes whenever a settlement was confirmed or voided, so the list reloads. */
  readonly refreshKey = input(0);
  readonly voidRequested = output<TitheSettlementRow>();
  readonly detailRequested = output<TitheSettlementRow>();

  protected readonly labels = SETTLEMENT_STATUS_LABELS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly errorMessage = userMessage;
  protected readonly status = signal<TitheSettlementStatus | null>(null);
  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  protected readonly pageNumber = signal(1);

  protected readonly hasFilters = computed(() => this.status() !== null || this.from() !== null || this.to() !== null);

  protected readonly history = rxResource({
    params: () => ({
      query: {
        status: this.status(),
        from: this.from(),
        to: this.to(),
        page: this.pageNumber(),
        pageSize: PAGE_SIZE,
      } satisfies SettlementQuery,
      refresh: this.refreshKey(),
    }),
    stream: ({ params }) => this.repository.list(params.query),
  });

  protected readonly page = computed(
    () => (this.history.hasValue() ? this.history.value() : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE }),
  );

  protected setStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.status.set(value === 'ISSUED' || value === 'VOIDED' ? value : null);
    this.pageNumber.set(1);
  }

  protected setFrom(event: Event): void {
    this.from.set((event.target as HTMLInputElement).value || null);
    this.pageNumber.set(1);
  }

  protected setTo(event: Event): void {
    this.to.set((event.target as HTMLInputElement).value || null);
    this.pageNumber.set(1);
  }

  protected clear(): void {
    this.status.set(null);
    this.from.set(null);
    this.to.set(null);
    this.pageNumber.set(1);
  }
}
