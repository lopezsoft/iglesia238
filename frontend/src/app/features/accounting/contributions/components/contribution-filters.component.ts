import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_CATEGORY_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  ContributionCategory,
  ContributionDisplayStatus,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PaymentMethod,
} from '../../data/accounting.models';
import { monthKey } from '../../data/year-month';
import { ContributionFormOptions } from '../data/contributions.models';

/** Value of the period selector that opens the date range inputs. */
export const CUSTOM_PERIOD = 'custom';

const STATUSES: readonly ContributionDisplayStatus[] = ['RECORDED', 'SETTLED', 'VOIDED'];

/**
 * Filter bar of the contributions list: month or date range, category, type, payment method,
 * status and free text. It only edits the models; the page turns them into the server query.
 */
@Component({
  selector: 'app-contribution-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="card filters" aria-labelledby="filters-title">
      <div class="filters__head">
        <h2 id="filters-title" class="filters__title"><app-icon name="filter" [size]="16" />Filtros</h2>
        @if (activeCount() > 0) {
          <button type="button" class="btn btn--ghost btn--sm" (click)="cleared.emit()">
            <app-icon name="x" [size]="14" />
            Limpiar filtros ({{ activeCount() }})
          </button>
        }
      </div>
      <div class="filters__grid">
        <div class="field">
          <label for="filter-period">Periodo</label>
          <select id="filter-period" class="select" (change)="periodKey.set(valueOf($event))">
            @for (period of options().periods; track period.year + '-' + period.month) {
              <option [value]="keyOf(period)" [selected]="periodKey() === keyOf(period)">
                {{ period.label }}{{ options().congregationScoped && period.status === 'CLOSED' ? ' · cerrado' : '' }}
              </option>
            }
            <option [value]="custom" [selected]="periodKey() === custom">Rango de fechas…</option>
          </select>
        </div>
        @if (periodKey() === custom) {
          <div class="field">
            <label for="filter-from">Desde</label>
            <input id="filter-from" class="input" type="date" [value]="from()" [attr.max]="to() || null" (change)="from.set(valueOf($event))" />
          </div>
          <div class="field">
            <label for="filter-to">Hasta</label>
            <input id="filter-to" class="input" type="date" [value]="to()" [attr.min]="from() || null" (change)="to.set(valueOf($event))" />
          </div>
        }
        <div class="field">
          <label for="filter-category">Categoría</label>
          <select id="filter-category" class="select" (change)="category.set(categoryOf($event))">
            <option value="" [selected]="category() === null">Todas</option>
            @for (item of categories; track item) {
              <option [value]="item" [selected]="category() === item">{{ categoryLabels[item] }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="filter-type">Tipo de aporte</label>
          <select id="filter-type" class="select" (change)="typeId.set(numberOf($event))">
            <option value="" [selected]="typeId() === null">Todos</option>
            @for (type of options().types; track type.id) {
              <option [value]="type.id" [selected]="typeId() === type.id">{{ type.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="filter-method">Medio de pago</label>
          <select id="filter-method" class="select" (change)="method.set(methodOf($event))">
            <option value="" [selected]="method() === null">Todos</option>
            @for (item of methods; track item) {
              <option [value]="item" [selected]="method() === item">{{ methodLabels[item] }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="filter-status">Estado</label>
          <select id="filter-status" class="select" (change)="status.set(statusOf($event))">
            <option value="" [selected]="status() === null">Todos</option>
            @for (item of statuses; track item) {
              <option [value]="item" [selected]="status() === item">{{ statusLabels[item] }}</option>
            }
          </select>
        </div>
        <div class="field filters__search">
          <label for="filter-search">Buscar</label>
          <div class="filters__search-box">
            <app-icon name="search" class="filters__search-icon" [size]="16" />
            <input
              id="filter-search"
              class="input"
              type="search"
              maxlength="80"
              autocomplete="off"
              placeholder="Recibo, aportante, referencia o descripción"
              [value]="search()"
              (input)="search.set(valueOf($event))"
            />
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    @use 'tokens' as *;

    .filters {
      display: flex;
      flex-direction: column;
      gap: $space-3;
      padding: $space-4 $space-5;
    }

    .filters__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: $space-2;
    }

    .filters__title {
      display: inline-flex;
      align-items: center;
      gap: $space-2;
      font-size: $font-size-sm;
    }

    .filters__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      gap: $space-3;
    }

    .filters__search {
      grid-column: span 2;
      min-width: 14rem;
    }

    .filters__search-box {
      position: relative;
    }

    .filters__search-icon {
      position: absolute;
      top: 50%;
      left: $space-3;
      transform: translateY(-50%);
      color: $color-ink-subtle;
      pointer-events: none;
    }

    .filters__search-box .input {
      padding-left: $space-6 + $space-1;
    }
  `,
})
export class ContributionFiltersComponent {
  readonly options = input.required<ContributionFormOptions>();
  /** 'YYYY-M' of a month in the selector, or `custom`. */
  readonly periodKey = model.required<string>();
  readonly from = model('');
  readonly to = model('');
  readonly category = model<ContributionCategory | null>(null);
  readonly typeId = model<number | null>(null);
  readonly method = model<PaymentMethod | null>(null);
  readonly status = model<ContributionDisplayStatus | null>(null);
  readonly search = model('');
  readonly cleared = output<void>();

  protected readonly custom = CUSTOM_PERIOD;
  protected readonly categories = CONTRIBUTION_CATEGORIES;
  protected readonly categoryLabels = CONTRIBUTION_CATEGORY_LABELS;
  protected readonly methods = PAYMENT_METHODS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly statuses = STATUSES;
  protected readonly statusLabels = CONTRIBUTION_STATUS_LABELS;
  protected readonly keyOf = monthKey;

  /** Filters other than the period that are set, to offer "Limpiar filtros". */
  protected readonly activeCount = computed(
    () =>
      [this.category(), this.typeId(), this.method(), this.status(), this.search().trim() || null].filter(
        (value) => value !== null,
      ).length,
  );

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected numberOf(event: Event): number | null {
    const value = this.valueOf(event);
    return value === '' ? null : Number(value);
  }

  protected categoryOf(event: Event): ContributionCategory | null {
    return (this.valueOf(event) || null) as ContributionCategory | null;
  }

  protected methodOf(event: Event): PaymentMethod | null {
    return (this.valueOf(event) || null) as PaymentMethod | null;
  }

  protected statusOf(event: Event): ContributionDisplayStatus | null {
    return (this.valueOf(event) || null) as ContributionDisplayStatus | null;
  }
}
