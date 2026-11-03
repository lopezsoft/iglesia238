import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { StatCardComponent } from '../../../../shared/ui/stat-card.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { PERIOD_STATUS_LABELS } from '../../data/accounting.models';
import { FundRow, SetupOverview } from '../data/accounting-setup.models';

/** Funds tab: KPIs and the fund table with the opening balance of the year. */
@Component({
  selector: 'app-funds-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MoneyPipe, RouterLink, StatCardComponent, StatusBadgeComponent],
  template: `
    <div class="stack">
      @if (overview(); as info) {
        <div class="kpi-grid">
          <app-stat-card label="Fondos activos" [value]="info.activeFunds + ' de ' + info.totalFunds" icon="wallet" />
          <app-stat-card
            [label]="'Saldo inicial consolidado ' + info.year"
            [value]="info.openingTotal | money"
            [hint]="'Fondos activos de ' + info.scopeLabel"
          />
          <app-stat-card
            label="Periodo contable actual"
            [value]="info.currentPeriod?.label ?? '—'"
            [hint]="info.currentPeriod ? periodStatusLabels[info.currentPeriod.status] : 'Selecciona una sede'"
            icon="calendar-check"
          />
        </div>
      }

      <section class="card card--flush" aria-labelledby="funds-title">
        <div class="card__header panel-header">
          <div>
            <h2 id="funds-title">Fondos</h2>
            <p class="text-muted text-small">
              El saldo inicial es el valor con que cada fondo abre el año contable {{ overview()?.year }}.
              @if (overview() && !overview()!.congregationScoped) {
                Vista consolidada de todas las sedes: selecciona una sede para editar saldos.
              }
            </p>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col" class="text-right">Saldo inicial {{ overview()?.year }}</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (fund of funds(); track fund.id) {
                <tr>
                  <td>{{ fund.name }}</td>
                  <td class="num">{{ fund.openingBalance | money }}</td>
                  <td>
                    <app-status-badge
                      [label]="fund.isActive ? 'Activo' : 'Inactivo'"
                      [tone]="fund.isActive ? 'success' : 'neutral'"
                    />
                  </td>
                  <td>
                    <div class="cluster row-actions">
                      <a class="btn btn--ghost btn--sm" routerLink="/accounting/cash-book">Libro de caja</a>
                      @if (canManage()) {
                        <button type="button" class="btn btn--secondary btn--sm" [attr.aria-label]="'Editar ' + fund.name" (click)="edit.emit(fund)">
                          Editar
                        </button>
                        @if (!fund.inUse) {
                          <button type="button" class="btn btn--danger-ghost btn--sm" [attr.aria-label]="'Eliminar ' + fund.name" (click)="remove.emit(fund)">
                            Eliminar
                          </button>
                        }
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td>Total fondos activos</td>
                <td class="num">{{ activeTotal() | money }}</td>
                <td colspan="2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p class="text-muted text-small table-note">{{ funds().length }} fondos · los fondos con movimientos no se eliminan: se desactivan.</p>
      </section>
    </div>
  `,
  styles: `
    @use 'tokens' as *;
    .panel-header {
      padding: $space-5 $space-5 0;
    }
    .row-actions {
      justify-content: flex-end;
      flex-wrap: nowrap;
    }
    .table-note {
      padding: $space-3 $space-5;
    }
  `,
})
export class FundsPanelComponent {
  readonly funds = input.required<readonly FundRow[]>();
  readonly overview = input<SetupOverview | undefined>();
  readonly canManage = input(false);
  readonly edit = output<FundRow>();
  readonly remove = output<FundRow>();

  protected readonly periodStatusLabels = PERIOD_STATUS_LABELS;
  protected readonly activeTotal = computed(() =>
    this.funds()
      .filter((fund) => fund.isActive)
      .reduce((sum, fund) => sum + fund.openingBalance, 0),
  );
}
