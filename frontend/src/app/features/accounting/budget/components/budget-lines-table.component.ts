import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { BudgetLineRow, BudgetTotals } from '../data/budget.models';

/** Lines of a budget with the execution bar (danger above 100 %) and the totals row. */
@Component({
  selector: 'app-budget-lines-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, MoneyPipe],
  styleUrl: './budget-lines-table.component.scss',
  template: `
    <div class="table-wrap">
      <table class="table">
        <caption class="visually-hidden">{{ caption() }}</caption>
        <thead>
          <tr>
            <th scope="col">Cuenta</th>
            <th scope="col">{{ fundHeader() }}</th>
            <th scope="col" class="text-right">Valor anual</th>
            <th scope="col" class="text-right">Valor mensual</th>
            <th scope="col" class="text-right">Ejecutado real</th>
            <th scope="col">% ejecución</th>
            <th scope="col" class="text-right">Diferencia</th>
            @if (canEdit()) {
              <th scope="col"><span class="visually-hidden">Acciones</span></th>
            }
          </tr>
        </thead>
        <tbody>
          @for (line of lines(); track line.id) {
            <tr>
              <td>
                <span class="account">
                  <span class="mono text-small">{{ line.accountCode }}</span>
                  <span>{{ line.accountName }}</span>
                  @if (line.sharedWith.length > 0) {
                    <span class="chip shared">También en {{ line.sharedWith.join(' y ') }}</span>
                  }
                </span>
              </td>
              <td>{{ line.fundName }}</td>
              <td class="num">{{ line.annualAmount | money }}</td>
              <td class="num" [class.text-muted]="line.monthlyAmount === null">{{ line.monthlyAmount | money }}</td>
              <td class="num">{{ line.executed | money }}</td>
              <td>
                <div class="meter">
                  <div class="meter__track">
                  <div
                    class="progress"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-valuenow]="clamp(line.executionPct)"
                    [attr.aria-label]="'Ejecución de ' + line.accountCode + ' · ' + line.fundName"
                  >
                    <div class="progress__bar" [class.progress__bar--danger]="line.overExecuted" [style.width.%]="clamp(line.executionPct)"></div>
                  </div>
                    <span class="meter__expected" aria-hidden="true" [style.left.%]="expectedPct()"></span>
                  </div>
                  <span class="mono text-small" [class.over]="line.overExecuted">{{ percent(line.executionPct) }}</span>
                </div>
                @if (line.overExecuted) {
                  <span class="badge badge--danger">Sobreejecutado</span>
                }
              </td>
              <td class="num" [class.over]="line.difference < 0">{{ line.difference | money }}</td>
              @if (canEdit()) {
                <td>
                  <span class="cluster actions">
                    <button type="button" class="btn btn--ghost btn--icon btn--sm" [attr.aria-label]="'Editar línea ' + line.accountCode + ' · ' + line.fundName" (click)="edit.emit(line)">
                      <app-icon name="edit" [size]="16" />
                    </button>
                    <button type="button" class="btn btn--ghost btn--icon btn--sm" [attr.aria-label]="'Eliminar línea ' + line.accountCode + ' · ' + line.fundName" (click)="remove.emit(line)">
                      <app-icon name="x" [size]="16" />
                    </button>
                  </span>
                </td>
              }
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2">{{ totalLabel() }}</td>
            <td class="num">{{ totals().annual | money }}</td>
            <td class="num">{{ totals().monthly ? (totals().monthly | money) : '—' }}</td>
            <td class="num">{{ totals().executed | money }}</td>
            <td class="mono" [class.over]="totals().executionPct > 100">{{ percent(totals().executionPct) }}</td>
            <td class="num" [class.over]="totals().difference < 0">{{ totals().difference | money }}</td>
            @if (canEdit()) {
              <td></td>
            }
          </tr>
        </tfoot>
      </table>
    </div>
  `,
})
export class BudgetLinesTableComponent {
  readonly lines = input.required<readonly BudgetLineRow[]>();
  readonly totals = input.required<BudgetTotals>();
  readonly totalLabel = input.required<string>();
  readonly caption = input.required<string>();
  readonly fundHeader = input('Fondo');
  readonly expectedPct = input(0);
  readonly canEdit = input(false);
  readonly edit = output<BudgetLineRow>();
  readonly remove = output<BudgetLineRow>();

  protected clamp(value: number): number {
    return Math.max(0, Math.min(value, 100));
  }

  /** 83.3 → "83,3 %". */
  protected percent(value: number): string {
    return `${value.toFixed(1).replace('.', ',')} %`;
  }
}
