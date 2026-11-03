import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { TitheRuleRow } from '../data/accounting-setup.models';
import { formatRate } from '../data/tithe-rate';

/** Tithe percentages tab: the rules the denomination entered, with the one in force highlighted. */
@Component({
  selector: 'app-tithe-rules-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, StatusBadgeComponent],
  template: `
    <section class="card card--flush" aria-labelledby="tithe-title">
      <div class="card__header panel-header">
        <div>
          <h2 id="tithe-title">Porcentajes de liquidación del diezmo</h2>
          <p class="text-muted text-small">
            Los define cada denominación y cambian con el tiempo. Nacional = diezmo bruto × % nacional · Fondo local =
            (bruto − nacional) × % local · Neto del pastor = lo que resta.
          </p>
        </div>
        @if (canManage()) {
          <button type="button" class="btn btn--primary" (click)="create.emit()">
            <app-icon name="plus" />
            Nuevo porcentaje
          </button>
        }
      </div>

      @if (rules().length === 0) {
        <div class="alert alert--warning panel-alert" role="status">
          <app-icon name="alert" />
          <span>
            Aún no se han definido los porcentajes del diezmo. La liquidación del diezmo no se puede emitir sin ellos: no
            hay valores por defecto.
          </span>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <caption class="visually-hidden">Porcentajes de liquidación del diezmo</caption>
            <thead>
              <tr>
                <th scope="col">Aplica desde</th>
                <th scope="col" class="text-right">% nacional</th>
                <th scope="col" class="text-right">% fondo local</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (rule of rules(); track rule.id) {
                <tr>
                  <td>{{ rule.effectiveFrom | date: 'dd/MM/yyyy' }}</td>
                  <td class="num">{{ formatRate(rule.nationalShareRate) }}</td>
                  <td class="num">{{ formatRate(rule.localFundRate) }}</td>
                  <td>
                    <app-status-badge
                      [label]="stateOf(rule).label"
                      [tone]="stateOf(rule).tone"
                    />
                    @if (rule.inUse) {
                      <div class="text-muted text-small">Con liquidaciones emitidas</div>
                    }
                  </td>
                  <td>
                    @if (canManage()) {
                      <div class="cluster row-actions">
                        <button
                          type="button"
                          class="btn btn--secondary btn--sm"
                          [disabled]="rule.inUse"
                          [attr.title]="rule.inUse ? 'Tiene liquidaciones emitidas' : null"
                          [attr.aria-label]="'Editar porcentaje desde ' + rule.effectiveFrom"
                          (click)="edit.emit(rule)"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          class="btn btn--danger-ghost btn--sm"
                          [disabled]="rule.inUse"
                          [attr.title]="rule.inUse ? 'Tiene liquidaciones emitidas' : null"
                          [attr.aria-label]="'Eliminar porcentaje desde ' + rule.effectiveFrom"
                          (click)="remove.emit(rule)"
                        >
                          Eliminar
                        </button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p class="text-muted text-small table-note">
          Para cambiar los porcentajes a futuro registra uno nuevo con su fecha de inicio: el anterior se conserva.
        </p>
      }
    </section>
  `,
  styles: `
    @use 'tokens' as *;
    .panel-header {
      padding: $space-5 $space-5 0;
    }
    .panel-alert {
      margin: $space-4 $space-5 $space-5;
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
export class TitheRulesPanelComponent {
  readonly rules = input.required<readonly TitheRuleRow[]>();
  readonly canManage = input(false);
  readonly today = input.required<string>();
  readonly create = output<void>();
  readonly edit = output<TitheRuleRow>();
  readonly remove = output<TitheRuleRow>();

  protected readonly formatRate = formatRate;

  protected stateOf(rule: TitheRuleRow): { label: string; tone: 'success' | 'info' | 'neutral' } {
    if (rule.inForce) {
      return { label: 'Vigente', tone: 'success' };
    }
    return rule.effectiveFrom > this.today() ? { label: 'Programado', tone: 'info' } : { label: 'Anterior', tone: 'neutral' };
  }
}
