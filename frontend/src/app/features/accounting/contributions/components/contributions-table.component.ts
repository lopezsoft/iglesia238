import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { CustomTooltipDirective } from '../../../../shared/ui/custom-tooltip.directive';
import { EmptyStateComponent, PaginationComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { BadgeTone, StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  CONTRIBUTION_CATEGORY_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  ContributionDisplayStatus,
  PAYMENT_METHOD_LABELS,
} from '../../data/accounting.models';
import { ContributionListing, ContributionRow } from '../data/contributions.models';

const STATUS_TONES: Readonly<Record<ContributionDisplayStatus, BadgeTone>> = {
  RECORDED: 'info',
  SETTLED: 'success',
  VOIDED: 'danger',
};

/** One page of contributions, newest first, with the detail and void actions. */
@Component({
  selector: 'app-contributions-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CustomTooltipDirective,
    DatePipe,
    EmptyStateComponent,
    IconComponent,
    MoneyPipe,
    PaginationComponent,
    RouterLink,
    StatusBadgeComponent,
  ],
  template: `
    <section class="card card--flush" aria-labelledby="table-title">
      <div class="card__header">
        <div>
          <h2 id="table-title">Aportes de {{ listing().label.toLowerCase() }}</h2>
          <p class="text-muted text-small">
            Del más reciente al más antiguo. Un aporte anulado se conserva con su motivo y no suma en los totales.
          </p>
        </div>
        <span class="chip">{{ listing().total }} {{ listing().total === 1 ? 'resultado' : 'resultados' }}</span>
      </div>
      <div class="table-wrap" [attr.aria-busy]="loading()">
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
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of listing().items; track row.id) {
              <tr>
                <td>{{ row.receivedOn | date: 'dd/MM/yyyy' }}</td>
                <td class="code">
                  <button type="button" class="link-button" (click)="detailRequested.emit(row)">{{ row.receiptNumber }}</button>
                </td>
                <td>
                  <div>{{ row.typeName }}</div>
                  <div class="text-muted text-small">{{ categoryLabels[row.category] }}</div>
                </td>
                <td>
                  <div>{{ row.contributorName ?? (row.notes ? 'Colecta agregada' : 'Anónimo') }}</div>
                  <div class="text-muted text-small">{{ detailOf(row) }}</div>
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
                <td class="actions">
                  <button type="button" class="btn btn--secondary btn--sm" [attr.aria-label]="'Ver detalle del recibo ' + row.receiptNumber" (click)="detailRequested.emit(row)">
                    <app-icon name="eye" [size]="14" />
                    Ver
                  </button>
                  @if (canDownloadReceipt() && row.voucherId !== null) {
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      [attr.aria-label]="'Descargar el recibo ' + row.receiptNumber + ' en PDF'"
                      (click)="receiptRequested.emit(row)"
                    >
                      <app-icon name="download" [size]="14" />
                      Recibo
                    </button>
                  }
                  @if (canWrite() && row.status === 'RECORDED') {
                    @if (row.voidBlock === 'CONSOLIDATED') {
                      <button type="button" class="btn btn--ghost btn--sm" disabled appCustomTooltip="Consolidado en el Libro de caja: reversa primero la consolidación" [attr.aria-label]="'Recibo ' + row.receiptNumber + ' consolidado en el Libro de caja: reversa primero la consolidación para anularlo'">
                        <app-icon name="lock" [size]="14" /> Anular
                      </button>
                    } @else {
                      <button type="button" class="btn btn--danger-ghost btn--sm" [attr.aria-label]="'Anular recibo ' + row.receiptNumber" (click)="voidRequested.emit(row)">
                        Anular
                      </button>
                    }
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="showCongregation() ? 9 : 8">
                  <app-empty-state
                    icon="receipt"
                    title="No hay aportes con esos criterios"
                    description="Cambia el periodo o limpia los filtros para ver más resultados."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="alert table-note" role="note">
        <app-icon name="info" />
        <span>
          Un aporte liquidado o consolidado no se puede anular: se corrige desde la
          <a routerLink="/accounting/tithe-settlements">Liquidación del diezmo</a> o el
          <a routerLink="/accounting/cash-book">Libro de caja</a>.
        </span>
      </div>
      <app-pagination
        [page]="listing().page"
        [pageSize]="listing().pageSize"
        [total]="listing().total"
        (pageChange)="pageChange.emit($event)"
      />
    </section>
  `,
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;

    .table-note {
      margin: $space-4 $space-5 0;
    }

    .voided {
      text-decoration: line-through;
      color: $color-ink-muted;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
      justify-content: flex-end;
    }

    .link-button {
      padding: 0;
      border: 0;
      background: none;
      color: $color-primary;
      font: inherit;
      font-weight: $font-weight-semibold;
      cursor: pointer;

      &:hover {
        text-decoration: underline;
      }

      &:focus-visible {
        @include focus-ring;
      }
    }
  `,
})
export class ContributionsTableComponent {
  readonly listing = input.required<ContributionListing>();
  readonly canWrite = input(false);
  readonly showCongregation = input(false);
  /** The receipt PDF needs a sede: a denomination-wide list shows the sede name instead. */
  readonly canDownloadReceipt = input(false);
  readonly loading = input(false);
  readonly pageChange = output<number>();
  readonly voidRequested = output<ContributionRow>();
  readonly detailRequested = output<ContributionRow>();
  readonly receiptRequested = output<ContributionRow>();

  protected readonly categoryLabels = CONTRIBUTION_CATEGORY_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly statusLabels = CONTRIBUTION_STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;

  /** Member code and pledge, or the description of a collection. */
  protected detailOf(row: ContributionRow): string {
    if (row.personId === null) {
      return row.notes ?? 'Sin datos del aportante';
    }
    const parts = [row.memberCode, row.vowPledgeCode ? `Abono a ${row.vowPledgeCode}` : null];
    return parts.filter(Boolean).join(' · ') || 'Sin código de miembro';
  }
}
