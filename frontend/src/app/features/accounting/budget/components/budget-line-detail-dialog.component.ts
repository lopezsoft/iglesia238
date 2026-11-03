import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { MiniStatComponent } from '../../../../shared/ui/mini-stat.component';
import { BudgetLineRow } from '../data/budget.models';
import { BudgetRepository } from '../data/budget.repository';

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/** Drill-down of one budget line: execution month by month and the latest cash movements behind it. */
@Component({
  selector: 'app-budget-line-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DialogComponent, ErrorBannerComponent, LoadingComponent, MiniStatComponent, MoneyPipe, RouterLink],
  styles: `
    @use 'tokens' as *;
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: $space-3;
    }
    .month-bar {
      min-width: 8rem;
    }
    h3 {
      margin: 0 0 $space-2;
      font-size: $font-size-md;
    }
    .over {
      color: $color-danger;
    }
  `,
  template: `
    <app-dialog [(open)]="open" variant="wide" [title]="title()">
      @if (detail.error(); as error) {
        <app-error-banner [message]="errorMessage(error)" (retry)="detail.reload()" />
      } @else if (!detail.hasValue()) {
        <app-loading label="Cargando detalle…" />
      } @else {
        @let data = detail.value()!;
        <div class="stack">
          <div class="summary">
            <app-mini-stat icon="banknote" tone="cyan" label="Valor anual" [value]="(data.line.annualAmount | money)" [meta]="data.line.fundName" />
            <app-mini-stat icon="coins" tone="green" label="Ejecutado real" [value]="(data.line.executed | money)" [meta]="percent(data.line.executionPct)" />
            <app-mini-stat
              icon="activity"
              [tone]="data.line.difference < 0 ? 'red' : 'slate'"
              label="Diferencia"
              [value]="(data.line.difference | money)"
              [meta]="data.line.overExecuted ? 'Sobreejecutada' : 'Disponible'"
            />
          </div>

          <section aria-labelledby="line-months-title">
            <h3 id="line-months-title">Ejecución mes a mes de {{ data.year }}</h3>
            <div class="table-wrap">
              <table class="table">
                <caption class="visually-hidden">Valor planeado y ejecutado de cada mes</caption>
                <thead>
                  <tr>
                    <th scope="col">Mes</th>
                    <th scope="col" class="text-right">Planeado</th>
                    <th scope="col" class="text-right">Ejecutado</th>
                    <th scope="col">Frente a lo planeado</th>
                  </tr>
                </thead>
                <tbody>
                  @for (month of months(); track month.month) {
                    <tr>
                      <td>{{ month.name }}</td>
                      <td class="num">{{ month.planned | money }}</td>
                      <td class="num" [class.over]="month.over">{{ month.executed | money }}</td>
                      <td class="month-bar">
                        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="month.pct" [attr.aria-label]="'Ejecución de ' + month.name">
                          <div class="progress__bar" [class.progress__bar--danger]="month.over" [style.width.%]="month.pct"></div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <p class="text-muted text-small">
              Cuando la línea no tiene valor mensual se muestra una doceava parte del valor anual como referencia.
            </p>
          </section>

          <section aria-labelledby="line-moves-title">
            <h3 id="line-moves-title">Últimos movimientos del libro de caja</h3>
            @if (data.movements.length === 0) {
              <p class="text-muted text-small">La cuenta y el fondo no tienen movimientos en {{ data.year }}.</p>
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <caption class="visually-hidden">Movimientos de caja que componen el ejecutado</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Descripción</th>
                      <th scope="col" class="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (move of data.movements; track move.id) {
                      <tr>
                        <td>{{ move.postedOn | date: 'dd/MM/yyyy' }}</td>
                        <td>{{ move.description }}</td>
                        <td class="num">{{ move.direction === 'OUT' ? '−' : '+' }}{{ move.amount | money }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="text-muted text-small">
                Se muestran los 25 más recientes. El detalle completo está en el
                <a routerLink="/accounting/cash-book">Libro de caja</a>.
              </p>
            }
          </section>
        </div>
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cerrar</button>
      </div>
    </app-dialog>
  `,
})
export class BudgetLineDetailDialogComponent {
  private readonly repository = inject(BudgetRepository);

  readonly open = model(false);
  readonly line = input.required<BudgetLineRow | null>();

  protected readonly errorMessage = userMessage;
  protected readonly title = computed(() => {
    const line = this.line();
    return line ? `${line.accountCode} · ${line.accountName} · ${line.fundName}` : 'Detalle de la línea';
  });

  private readonly target = computed(() => (this.open() ? (this.line()?.id ?? null) : null));

  protected readonly detail = rxResource({
    params: () => this.target() ?? undefined,
    stream: ({ params }) => this.repository.lineDetail(params),
  });

  protected readonly months = computed(() => {
    if (!this.detail.hasValue()) {
      return [];
    }
    return this.detail.value().months.map((month) => {
      const ratio = month.planned > 0 ? month.executed / month.planned : 0;
      return {
        month: month.month,
        name: MONTH_NAMES[month.month - 1],
        planned: month.planned,
        executed: month.executed,
        pct: Math.max(0, Math.min(Math.round(ratio * 100), 100)),
        over: ratio > 1,
      };
    });
  });

  /** 83.3 → "83,3 %". */
  protected percent(value: number): string {
    return `${value.toFixed(1).replace('.', ',')} % del anual`;
  }
}
