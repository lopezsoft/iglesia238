import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
} from '@angular/forms';
import { AuditFilterOptions, AuditQuery, MAX_RANGE_DAYS, auditActionLabel, auditEntityLabel } from '../data/audit-log.models';

export type AuditFilters = Omit<AuditQuery, 'page' | 'pageSize'>;

export const EMPTY_AUDIT_FILTERS: AuditFilters = { from: null, to: null, userId: null, action: null, entity: null };

const DAY_MS = 86_400_000;

const rangeOrder: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const { from, to } = group.value as { from: string; to: string };
  return from && to && from > to ? { rangeOrder: true } : null;
};

/** Same limit the API applies: at most MAX_RANGE_DAYS calendar days, both ends included. */
export const rangeLength: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const { from, to } = group.value as { from: string; to: string };
  if (!from || !to || from > to) {
    return null;
  }
  // yyyy-MM-dd strings parse as UTC midnight, so the difference is a whole number of days.
  const days = (Date.parse(to) - Date.parse(from)) / DAY_MS + 1;
  return days > MAX_RANGE_DAYS ? { rangeLength: { max: MAX_RANGE_DAYS, actual: days } } : null;
};

/** Date range, user, action and entity filters; applied on submit. */
@Component({
  selector: 'app-audit-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <form class="card stack" [formGroup]="form" (ngSubmit)="submit()" aria-labelledby="audit-filters-title" novalidate>
      <h2 id="audit-filters-title" class="filters__title">Filtros</h2>
      <div class="form-grid">
        <div class="field">
          <label for="filter-from">Desde</label>
          <input id="filter-from" class="input" type="date" formControlName="from" />
        </div>
        <div class="field">
          <label for="filter-to">Hasta</label>
          <input id="filter-to" class="input" type="date" formControlName="to" />
        </div>
        <div class="field">
          <label for="filter-user">Usuario</label>
          <select id="filter-user" class="select" formControlName="userId">
            <option value="">Todos los usuarios</option>
            @for (user of options()?.users ?? []; track user.id) {
              <option [value]="user.id">{{ user.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="filter-action">Acción</label>
          <select id="filter-action" class="select" formControlName="action">
            <option value="">Todas las acciones</option>
            @for (action of options()?.actions ?? []; track action) {
              <option [value]="action">{{ actionLabel(action) }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="filter-entity">Entidad</label>
          <select id="filter-entity" class="select" formControlName="entity">
            <option value="">Todas las entidades</option>
            @for (entity of options()?.entities ?? []; track entity) {
              <option [value]="entity">{{ entityLabel(entity) }}</option>
            }
          </select>
        </div>
      </div>
      @if (form.hasError('rangeOrder')) {
        <p class="field__error" role="alert">La fecha «Desde» no puede ser posterior a la fecha «Hasta».</p>
      } @else if (form.hasError('rangeLength')) {
        <p class="field__error" role="alert">El rango máximo de consulta es de {{ maxRangeDays }} días.</p>
      }
      <div class="cluster filters__footer">
        <p class="text-muted text-small">
          El rango máximo de consulta es de {{ maxRangeDays }} días. Los eventos no se pueden editar ni eliminar.
        </p>
        <div class="cluster">
          <button type="button" class="btn btn--secondary" (click)="clear()">Limpiar</button>
          <button type="submit" class="btn btn--primary">Aplicar filtros</button>
        </div>
      </div>
    </form>
  `,
  styles: `
    .filters__title {
      font-size: 1rem;
    }
    .filters__footer {
      justify-content: space-between;
    }
  `,
})
export class AuditFiltersComponent {
  readonly options = input<AuditFilterOptions | undefined>(undefined);
  readonly apply = output<AuditFilters>();

  protected readonly maxRangeDays = MAX_RANGE_DAYS;
  protected readonly actionLabel = auditActionLabel;
  protected readonly entityLabel = auditEntityLabel;
  protected readonly form = inject(NonNullableFormBuilder).group(
    { from: '', to: '', userId: '', action: '', entity: '' },
    { validators: [rangeOrder, rangeLength] },
  );

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    this.apply.emit({
      from: value.from || null,
      to: value.to || null,
      userId: value.userId ? Number(value.userId) : null,
      action: value.action || null,
      entity: value.entity || null,
    });
  }

  protected clear(): void {
    this.form.reset();
    this.apply.emit(EMPTY_AUDIT_FILTERS);
  }
}
