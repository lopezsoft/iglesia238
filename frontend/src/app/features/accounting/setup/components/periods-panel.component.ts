import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { PERIOD_STATUS_LABELS } from '../../data/accounting.models';
import { PeriodRow, SetupOverview } from '../data/accounting-setup.models';

/** Periods tab: the months the sede can post to, and the button that opens a new one. */
@Component({
  selector: 'app-periods-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, EmptyStateComponent, IconComponent, RouterLink, StatusBadgeComponent],
  template: `
    @if (overview() && !overview()!.congregationScoped) {
      <section class="card">
        <app-empty-state
          icon="calendar-check"
          title="Selecciona una sede"
          description="Los periodos contables pertenecen a cada sede. Elige una sede en el selector superior para ver y abrir sus periodos."
        />
      </section>
    } @else {
      <section class="card card--flush" aria-labelledby="periods-title">
        <div class="card__header panel-header">
          <div>
            <h2 id="periods-title">Periodos contables</h2>
            <p class="text-muted text-small">
              Cada mes se cierra por separado, en orden. Al cerrar uno se abre el siguiente; el cierre de diciembre traslada
              los saldos de los fondos al año nuevo.
            </p>
          </div>
          @if (canOpen()) {
            <button type="button" class="btn btn--primary" (click)="openRequested.emit()">
              <app-icon name="plus" />
              {{ periods().length === 0 ? 'Abrir el primer periodo' : 'Abrir periodo' }}
            </button>
          }
        </div>

        @if (periods().length === 0) {
          <div class="alert alert--warning panel-alert" role="status">
            <app-icon name="alert" />
            <span>
              Esta sede aún no tiene periodos contables. Mientras no abras uno no se pueden registrar aportes ni
              movimientos de caja.
            </span>
          </div>
        } @else {
          <div class="table-wrap">
            <table class="table">
              <caption class="visually-hidden">Periodos contables de la sede</caption>
              <thead>
                <tr>
                  <th scope="col">Periodo</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Hasta</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Cerrado el</th>
                  <th scope="col"><span class="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                @for (period of periods(); track period.id) {
                  <tr>
                    <td>{{ period.label }}</td>
                    <td>{{ period.from | date: 'dd/MM/yyyy' }}</td>
                    <td>{{ period.to | date: 'dd/MM/yyyy' }}</td>
                    <td>
                      <app-status-badge
                        [label]="statusLabels[period.status]"
                        [tone]="period.status === 'OPEN' ? 'success' : 'neutral'"
                      />
                    </td>
                    <td class="text-muted">{{ period.closedAt ? (period.closedAt | date: 'dd/MM/yyyy') : '—' }}</td>
                    <td class="text-right">
                      @if (period.status === 'OPEN') {
                        <a class="btn btn--ghost btn--sm" routerLink="/accounting/cash-book">Libro de caja</a>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="text-muted text-small table-note">
            {{ periods().length }} {{ periods().length === 1 ? 'periodo' : 'periodos' }} · el cierre se hace desde el libro de caja.
          </p>
        }
      </section>
    }
  `,
  styles: `
    @use 'tokens' as *;
    .panel-header {
      padding: $space-5 $space-5 0;
    }
    .panel-alert {
      margin: $space-4 $space-5 $space-5;
    }
    .table-note {
      padding: $space-3 $space-5;
    }
  `,
})
export class PeriodsPanelComponent {
  readonly periods = input.required<readonly PeriodRow[]>();
  readonly overview = input<SetupOverview | undefined>();
  readonly canOpen = input(false);
  readonly openRequested = output<void>();

  protected readonly statusLabels = PERIOD_STATUS_LABELS;
}
