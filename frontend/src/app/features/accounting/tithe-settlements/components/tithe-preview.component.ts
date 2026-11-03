import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MoneyPipe, formatMoney } from '../../../../shared/pipes/money.pipe';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatCardComponent } from '../../../../shared/ui/stat-card.component';
import { PAYMENT_METHOD_LABELS } from '../../data/accounting.models';
import {
  COMPONENT_NAMES,
  bookingLabel,
  componentRateLabel,
  componentTarget,
} from '../data/tithe-labels';
import { TithePreview } from '../data/tithe-settlements.models';

const VISIBLE_CONTRIBUTIONS = 10;

/** Step 2: included tithes, components with the copied percentages and the confirmation. */
@Component({
  selector: 'app-tithe-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, MoneyPipe, StatCardComponent],
  styleUrl: './tithe-preview.component.scss',
  template: `
    <section class="card stack" aria-labelledby="result-title">
      <div class="card__header">
        <div>
          <h2 id="result-title">Revisión del cálculo</h2>
          <p class="text-muted text-small">
            Rango cubierto: {{ preview().from | date: 'dd/MM/yyyy' }} – {{ preview().to | date: 'dd/MM/yyyy' }} ·
            {{ preview().congregationName }} · Borrador sin confirmar
          </p>
        </div>
        <span class="badge badge--warning">Pendiente de confirmar</span>
      </div>

      @if (preview().count === 0) {
        <div class="alert alert--warning" role="status">
          <app-icon name="info" />
          <span>No hay diezmos por liquidar en el rango: todos están anulados, ya liquidados o no hay registros.</span>
        </div>
      } @else {
        <div class="kpi-grid">
          <app-stat-card icon="coins" tone="green" label="Diezmos incluidos" [value]="preview().count" [hint]="contributorsHint()" />
          <app-stat-card icon="banknote" tone="cyan" label="Total bruto" [value]="gross()" hint="Diezmos registrados y no liquidados" />
          <app-stat-card
            icon="ban"
            tone="orange"
            label="Excluidos del cálculo"
            [value]="preview().excludedCount"
            hint="Aportes anulados en el rango"
          />
        </div>

        <div>
          <h3>Distribución por componente</h3>
          <p class="text-muted text-small">
            Porcentajes vigentes desde el {{ preview().rule.effectiveFrom | date: 'dd/MM/yyyy' }}. Se copian a la liquidación al
            confirmarla; un cambio posterior en la configuración no la modifica.
          </p>
          <div class="table-wrap">
            <table class="table">
              <caption class="visually-hidden">Componentes de la liquidación con su porcentaje vigente y valor</caption>
              <thead>
                <tr>
                  <th scope="col">Componente</th>
                  <th scope="col">Destino</th>
                  <th scope="col">Porcentaje vigente</th>
                  <th scope="col">Registro en caja</th>
                  <th scope="col" class="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                @for (component of rows(); track component.key) {
                  <tr>
                    <td>{{ component.name }}</td>
                    <td class="text-muted">{{ component.target }}</td>
                    <td>{{ component.rateLabel }}</td>
                    <td class="text-muted text-small">{{ component.booking }}</td>
                    <td class="num">{{ component.amount | money }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2">Total</td>
                  <td>100 %</td>
                  <td></td>
                  <td class="num">{{ preview().componentsTotal | money }}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="sum-check text-small" [class.sum-check--ok]="balanced()">
            <app-icon [name]="balanced() ? 'check' : 'alert'" [size]="16" />
            {{ balanced() ? 'Los componentes suman el bruto' : 'Los componentes no suman el bruto' }}
            ({{ preview().componentsTotal | money }})
          </p>
          @if (unbooked().length > 0) {
            <div class="alert alert--warning" role="note">
              <app-icon name="alert" />
              <span>
                Sin movimiento de caja: {{ unbooked().join(' y ') }}. La cuenta de egreso no existe en el plan de cuentas de la
                denominación; la liquidación se emite igual, pero ese valor no se registra en el libro de caja.
              </span>
            </div>
          }
        </div>

        <div class="linked">
          <button
            type="button"
            class="linked__toggle"
            [attr.aria-expanded]="expanded()"
            aria-controls="linked-contributions"
            (click)="expanded.set(!expanded())"
          >
            <span>Aportes vinculados ({{ preview().count }} diezmos)</span>
            <span class="cluster">
              {{ expanded() ? 'Ocultar' : 'Mostrar' }}
              <app-icon name="chevron-down" [size]="18" [class.linked__chevron--open]="expanded()" />
            </span>
          </button>
          <div id="linked-contributions">
            @if (expanded()) {
              <div class="table-wrap">
                <table class="table">
                  <caption class="visually-hidden">Diezmos incluidos en el cálculo</caption>
                  <thead>
                    <tr>
                      <th scope="col">Recibo</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Aportante</th>
                      <th scope="col">Medio de pago</th>
                      <th scope="col" class="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of visibleContributions(); track row.id) {
                      <tr>
                        <td class="code">{{ row.receiptNumber ?? '—' }}</td>
                        <td>{{ row.receivedOn | date: 'dd/MM/yyyy' }}</td>
                        <td>
                          <div [class.text-muted]="!row.contributorName">{{ row.contributorName ?? 'Anónimo' }}</div>
                          <div class="text-muted text-small mono">{{ row.memberCode ?? 'Sin código de miembro' }}</div>
                        </td>
                        <td>{{ methodLabels[row.paymentMethod] }}</td>
                        <td class="num">{{ row.amount | money }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="linked__footer text-small">
                <span class="text-muted">Mostrando {{ visibleContributions().length }} de {{ preview().count }} diezmos del rango</span>
                @if (visibleContributions().length < preview().count) {
                  <button type="button" class="btn btn--ghost btn--sm" (click)="showAll.set(true)">Ver todos</button>
                }
              </div>
            }
          </div>
        </div>
      }

      <div class="card__footer confirm">
        <p class="text-small confirm__text">
          @if (preview().count > 0) {
            Al confirmar se reserva el siguiente número (<span class="mono">{{ preview().nextNumber }}</span>), los
            {{ preview().count }} diezmos quedan vinculados y no podrán incluirse en otra liquidación mientras esta no se anule.
          }
        </p>
        @if (error()) {
          <div class="alert alert--danger confirm__error" role="alert">{{ error() }}</div>
        }
        <button type="button" class="btn btn--secondary" (click)="discard.emit()">Descartar cálculo</button>
        <button
          type="button"
          class="btn btn--primary"
          [disabled]="!canConfirm() || confirming() || preview().count === 0"
          (click)="confirm.emit()"
        >
          <app-icon name="check" />
          {{ confirming() ? 'Confirmando…' : 'Confirmar liquidación' }}
        </button>
      </div>
    </section>
  `,
})
export class TithePreviewComponent {
  readonly preview = input.required<TithePreview>();
  readonly canConfirm = input(false);
  readonly confirming = input(false);
  readonly error = input<string | null>(null);
  readonly confirm = output<void>();
  readonly discard = output<void>();

  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly expanded = signal(false);
  protected readonly showAll = signal(false);

  protected readonly gross = computed(() => formatMoney(this.preview().grossTithe));
  protected readonly balanced = computed(() => this.preview().componentsTotal === this.preview().grossTithe);
  protected readonly contributorsHint = computed(() => {
    const { contributorCount, anonymousCount } = this.preview();
    return `De ${contributorCount} ${contributorCount === 1 ? 'miembro' : 'miembros'} y ${anonymousCount} ${anonymousCount === 1 ? 'aporte anónimo' : 'aportes anónimos'}`;
  });

  protected readonly rows = computed(() => {
    const { components, rule, denominationName, congregationName, localFundName } = this.preview();
    return components.map((component) => ({
      key: component.key,
      name: COMPONENT_NAMES[component.key],
      target: componentTarget(component.key, { denominationName, congregationName, localFundName }),
      rateLabel: componentRateLabel(component, rule),
      booking: bookingLabel(component),
      amount: component.amount,
    }));
  });

  /** Payable components whose account is missing from the chart: they will not touch the cash book. */
  protected readonly unbooked = computed(() =>
    this.preview()
      .components.filter((component) => component.key !== 'LOCAL_FUND' && component.amount > 0 && component.booking === null)
      .map((component) => COMPONENT_NAMES[component.key].toLowerCase()),
  );

  protected readonly visibleContributions = computed(() =>
    this.showAll() ? this.preview().contributions : this.preview().contributions.slice(0, VISIBLE_CONTRIBUTIONS),
  );
}
