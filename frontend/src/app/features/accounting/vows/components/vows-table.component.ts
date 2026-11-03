import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { EmptyStateComponent, PaginationComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { VOW_PLEDGE_STATUS_LABELS } from '../../data/accounting.models';
import { VowPledgeRow } from '../data/vows.models';
import { VOW_STATUS_TONES } from '../vow-status';

/** One page of pledges with progress bars and the shortcut to register a payment. */
@Component({
  selector: 'app-vows-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, EmptyStateComponent, IconComponent, MoneyPipe, PaginationComponent, RouterLink, StatusBadgeComponent],
  template: `
    <section class="card card--flush" aria-labelledby="vows-table-title">
      <div class="card__header">
        <div>
          <h2 id="vows-table-title">Promesas</h2>
          <p class="text-muted text-small">Del compromiso más reciente al más antiguo. El abonado se calcula con los aportes no anulados.</p>
        </div>
        <span class="chip">{{ total() }} {{ total() === 1 ? 'resultado' : 'resultados' }}</span>
      </div>
      <div class="table-wrap" [attr.aria-busy]="loading()">
        <table class="table">
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">Tipo de aporte</th>
              <th scope="col">Promesa</th>
              <th scope="col" class="text-right">Prometido</th>
              <th scope="col" class="text-right">Abonado</th>
              <th scope="col" class="text-right">Saldo</th>
              <th scope="col">Avance</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr [class.is-selected]="selectedId() === row.id">
                <td>
                  <button type="button" class="link-button" (click)="detailRequested.emit(row)">{{ row.personName }}</button>
                  <div class="text-muted text-small">
                    <span class="mono">{{ row.memberCode }}</span> · {{ row.code }}
                    @if (showCongregation()) {
                      · {{ row.congregationName }}
                    }
                  </div>
                </td>
                <td><span class="badge badge--info">{{ row.typeName }}</span></td>
                <td>
                  <div>{{ row.pledgedOn | date: 'dd/MM/yyyy' }}</div>
                  @if (row.dueOn) {
                    <div class="text-small" [class.text-danger]="row.isOverdue" [class.text-muted]="!row.isOverdue">
                      Límite {{ row.dueOn | date: 'dd/MM/yyyy' }}
                    </div>
                  }
                </td>
                <td class="num">{{ row.pledgedAmount | money }}</td>
                <td class="num">{{ row.paid | money }}</td>
                <td class="num">{{ row.balance | money }}</td>
                <td>
                  <div class="progress-cell">
                    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="row.progress" [attr.aria-label]="'Avance de la promesa ' + row.code">
                      <div class="progress__bar" [class.progress__bar--success]="row.status === 'FULFILLED'" [style.width.%]="row.progress"></div>
                    </div>
                    <span class="text-small mono">{{ row.progress }} %</span>
                  </div>
                </td>
                <td>
                  <div class="cluster states">
                    <app-status-badge [label]="statusLabels[row.status]" [tone]="statusTones[row.status]" />
                    @if (row.isOverdue) {
                      <span class="badge badge--danger">Vencida</span>
                    }
                  </div>
                </td>
                <td class="actions">
                  <button type="button" class="btn btn--secondary btn--sm" [attr.aria-label]="'Ver abonos de ' + row.code" (click)="detailRequested.emit(row)">
                    <app-icon name="eye" [size]="14" />
                    Ver abonos
                  </button>
                  @if (canPay() && row.status === 'ACTIVE') {
                    <a class="btn btn--ghost btn--sm" routerLink="/accounting/contributions" [queryParams]="{ vowPledgeId: row.id }" [attr.aria-label]="'Registrar abono a ' + row.code">
                      <app-icon name="plus" [size]="14" />
                      Abonar
                    </a>
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9">
                  <app-empty-state
                    icon="heart"
                    title="No hay promesas con esos criterios"
                    description="Cambia el estado, el tipo o la búsqueda para ver más promesas."
                  />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-pagination [page]="page()" [pageSize]="pageSize()" [total]="total()" (pageChange)="pageChange.emit($event)" />
    </section>
  `,
  styles: `
    @use 'tokens' as *;
    @use 'mixins' as *;

    .progress-cell {
      display: flex;
      align-items: center;
      gap: $space-2;
      min-width: 8rem;

      .progress {
        flex: 1;
      }
    }

    .states {
      gap: $space-1;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
      justify-content: flex-end;
    }

    .text-danger {
      color: $color-danger;
      font-weight: $font-weight-semibold;
    }

    .link-button {
      padding: 0;
      border: 0;
      background: none;
      color: $color-primary;
      font: inherit;
      font-weight: $font-weight-semibold;
      text-align: left;
      cursor: pointer;

      &:hover {
        color: $color-primary-hover;
        text-decoration: underline;
      }

      &:focus-visible {
        @include focus-ring;
      }
    }
  `,
})
export class VowsTableComponent {
  readonly rows = input.required<readonly VowPledgeRow[]>();
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly selectedId = input<number | null>(null);
  readonly showCongregation = input(false);
  /** Can register payments (contributions.write in a sede). */
  readonly canPay = input(false);
  readonly loading = input(false);
  readonly pageChange = output<number>();
  readonly detailRequested = output<VowPledgeRow>();

  protected readonly statusLabels = VOW_PLEDGE_STATUS_LABELS;
  protected readonly statusTones = VOW_STATUS_TONES;
}
