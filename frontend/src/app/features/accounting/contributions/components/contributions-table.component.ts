import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { PaginationComponent } from '../../../../shared/ui/feedback.components';
import { BadgeTone, StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { paginate } from '../../../../shared/utils/pagination';
import {
  CONTRIBUTION_CATEGORY_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  ContributionCategory,
  ContributionDisplayStatus,
  PAYMENT_METHOD_LABELS,
} from '../../data/accounting.models';
import { ContributionRow } from '../data/contributions.models';

const PAGE_SIZE = 10;
const STATUS_TONES: Readonly<Record<ContributionDisplayStatus, BadgeTone>> = {
  RECORDED: 'info',
  SETTLED: 'success',
  VOIDED: 'danger',
};

/** Contributions of the month, newest receipt first, with the void action. */
@Component({
  selector: 'app-contributions-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, MoneyPipe, PaginationComponent, RouterLink, StatusBadgeComponent],
  template: `
    <section class="card card--flush" aria-labelledby="table-title">
      <div class="card__header table-header">
        <div>
          <h2 id="table-title">Aportes de {{ monthLabel() }}</h2>
          <p class="text-muted text-small">Ordenados por número de recibo, del más reciente al más antiguo.</p>
        </div>
        <div class="field">
          <label for="type-filter">Tipo</label>
          <select id="type-filter" class="select" [value]="category()" (change)="onFilter($event)">
            <option value="ALL">Todos</option>
            @for (option of categoryOptions; track option) {
              <option [value]="option">{{ categoryLabels[option] }}</option>
            }
          </select>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Recibo</th>
              <th scope="col">Tipo</th>
              <th scope="col">Aportante</th>
              @if (showCongregation()) {
                <th scope="col">Sede</th>
              }
              <th scope="col">Medio</th>
              <th scope="col" class="text-right">Valor</th>
              <th scope="col">Estado</th>
              <th scope="col">Acción</th>
            </tr>
          </thead>
          <tbody>
            @for (row of page().items; track row.id) {
              <tr>
                <td>{{ row.receivedOn | date: 'dd/MM/yyyy' }}</td>
                <td class="code">{{ row.receiptNumber }}</td>
                <td>{{ row.typeName }}</td>
                <td>
                  <div>{{ row.contributorName ?? 'Anónimo' }}</div>
                  <div class="text-muted text-small">{{ row.contributorDetail }}</div>
                </td>
                @if (showCongregation()) {
                  <td>{{ row.congregationName }}</td>
                }
                <td>
                  <div>{{ methodLabels[row.paymentMethod] }}</div>
                  @if (row.paymentReference) {
                    <div class="text-muted text-small mono">{{ row.paymentReference }}</div>
                  }
                </td>
                <td class="num" [class.voided]="row.status === 'VOIDED'">{{ row.amount | money }}</td>
                <td><app-status-badge [label]="statusLabels[row.status]" [tone]="statusTones[row.status]" /></td>
                <td>
                  @switch (row.status) {
                    @case ('VOIDED') {
                      <span class="text-muted text-small">Motivo: {{ row.voidReason }}</span>
                    }
                    @case ('SETTLED') {
                      <button type="button" class="btn btn--ghost btn--sm" disabled title="Un aporte liquidado no se puede anular" [attr.aria-label]="'Recibo ' + row.receiptNumber + ' liquidado: no se puede anular'">
                        <app-icon name="lock" [size]="14" /> Anular
                      </button>
                    }
                    @default {
                      @if (row.voidBlock === 'CONSOLIDATED') {
                        <button type="button" class="btn btn--ghost btn--sm" disabled title="Consolidado en el Libro de caja: reversa primero la consolidación" [attr.aria-label]="'Recibo ' + row.receiptNumber + ' consolidado en el Libro de caja: reversa primero la consolidación para anularlo'">
                          <app-icon name="lock" [size]="14" /> Anular
                        </button>
                      } @else if (canWrite()) {
                        <button type="button" class="btn btn--danger-ghost btn--sm" [attr.aria-label]="'Anular recibo ' + row.receiptNumber" (click)="voidRequested.emit(row)">
                          Anular
                        </button>
                      } @else {
                        <span class="text-muted text-small">—</span>
                      }
                    }
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="showCongregation() ? 9 : 8" class="text-muted">No hay aportes de este tipo en {{ monthLabel() }}.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="alert table-note" role="note">
        <app-icon name="info" />
        <span>
          Un aporte liquidado no se puede anular: ya forma parte de una liquidación del diezmo. Para corregirlo, registra un
          ajuste en el <a routerLink="/accounting/cash-book">Libro de caja</a>.
        </span>
      </div>
      <app-pagination [page]="pageNumber()" [pageSize]="pageSize" [total]="filtered().length" (pageChange)="pageNumber.set($event)" />
    </section>
  `,
  styles: `
    @use 'tokens' as *;
    .table-header {
      align-items: flex-end;
      padding: $space-5 $space-5 0;
    }
    .table-note {
      margin: $space-4 $space-5 0;
    }
    .voided {
      text-decoration: line-through;
      color: $color-ink-muted;
    }
  `,
})
export class ContributionsTableComponent {
  readonly rows = input.required<readonly ContributionRow[]>();
  readonly monthLabel = input.required<string>();
  readonly canWrite = input(false);
  readonly showCongregation = input(false);
  readonly voidRequested = output<ContributionRow>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly categoryOptions: readonly ContributionCategory[] = ['TITHE', 'OFFERING', 'FIRST_FRUITS', 'VOW', 'OTHER'];
  protected readonly categoryLabels = CONTRIBUTION_CATEGORY_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly statusLabels = CONTRIBUTION_STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;

  protected readonly category = signal<ContributionCategory | 'ALL'>('ALL');
  protected readonly filtered = computed(() =>
    this.category() === 'ALL' ? this.rows() : this.rows().filter((row) => row.category === this.category()),
  );
  /** Back to the first page whenever the rows or the filter change. */
  protected readonly pageNumber = linkedSignal({ source: this.filtered, computation: () => 1 });
  protected readonly page = computed(() => paginate(this.filtered(), { page: this.pageNumber(), pageSize: PAGE_SIZE }));

  protected onFilter(event: Event): void {
    this.category.set((event.target as HTMLSelectElement).value as ContributionCategory | 'ALL');
  }
}
