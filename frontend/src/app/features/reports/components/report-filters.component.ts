import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ReportOptions, ReportQuery } from '../data/reports.models';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Same rules as the API: YYYY-MM-DD dates, from ≤ to, both in the same year. */
export function rangeValidator(group: AbstractControl): ValidationErrors | null {
  const from: string = group.get('from')?.value ?? '';
  const to: string = group.get('to')?.value ?? '';
  if (!from || !to) {
    return null;
  }
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return { invalidDate: true };
  }
  if (from > to) {
    return { reversed: true };
  }
  return from.slice(0, 4) === to.slice(0, 4) ? null : { crossesYear: true };
}

/** Date range and fund of the report; the scope comes from the "Actuar en" selector. */
@Component({
  selector: 'app-report-filters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <section class="card" aria-labelledby="filters-title">
      <h2 id="filters-title" class="filters__title">Filtros del reporte</h2>
      <form class="toolbar" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="report-from">Desde *</label>
          <input
            id="report-from"
            class="input"
            type="date"
            formControlName="from"
            required
            [attr.aria-invalid]="showError('from')"
          />
        </div>
        <div class="field">
          <label for="report-to">Hasta *</label>
          <input
            id="report-to"
            class="input"
            type="date"
            formControlName="to"
            required
            [attr.aria-invalid]="showError('to')"
          />
        </div>
        <div class="field">
          <label for="report-scope">Alcance</label>
          <input
            id="report-scope"
            class="input"
            type="text"
            [value]="options().scopeLabel"
            readonly
            aria-describedby="report-scope-hint"
          />
          <span id="report-scope-hint" class="field__hint">Cámbialo en «Actuar en»</span>
        </div>
        <div class="field">
          <label for="report-fund">Fondo</label>
          <select id="report-fund" class="select" formControlName="fundId">
            <option value="">Todos</option>
            @for (fund of options().funds; track fund.id) {
              <option [value]="fund.id">
                {{ fund.name }}{{ fund.isActive ? '' : ' (inactivo)' }}
              </option>
            }
          </select>
        </div>
        <button type="submit" class="btn btn--primary" [disabled]="pending()">Generar</button>
      </form>
      @if (rangeError(); as message) {
        <p class="field__error" role="alert">{{ message }}</p>
      }
    </section>
  `,
  styles: `
    @use 'tokens' as *;

    .filters__title {
      margin-bottom: $space-4;
      font-size: $font-size-md;
    }
  `,
})
export class ReportFiltersComponent {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly options = input.required<ReportOptions>();
  readonly query = input.required<ReportQuery>();
  readonly pending = input(false);
  readonly apply = output<ReportQuery>();

  protected readonly form = this.fb.group(
    {
      from: ['', Validators.required],
      to: ['', Validators.required],
      fundId: [''],
    },
    { validators: rangeValidator },
  );

  constructor() {
    effect(() => {
      const query = this.query();
      this.form.setValue(
        {
          from: query.from,
          to: query.to,
          fundId: query.fundId === null ? '' : String(query.fundId),
        },
        { emitEvent: false },
      );
    });
  }

  protected showError(name: 'from' | 'to'): boolean {
    const control = this.form.controls[name];
    return control.touched && (control.invalid || this.form.invalid);
  }

  protected rangeError(): string | null {
    const { from, to } = this.form.controls;
    if (!from.touched && !to.touched) {
      return null;
    }
    if (from.hasError('required') || to.hasError('required')) {
      return 'Indica las fechas «Desde» y «Hasta».';
    }
    if (this.form.hasError('invalidDate')) {
      return 'Indica fechas válidas en «Desde» y «Hasta».';
    }
    if (this.form.hasError('reversed')) {
      return 'La fecha «Desde» no puede ser posterior a la fecha «Hasta».';
    }
    if (this.form.hasError('crossesYear')) {
      return 'El reporte cubre un solo año contable: elige fechas del mismo año.';
    }
    return null;
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const { from, to, fundId } = this.form.getRawValue();
    this.apply.emit({ from, to, fundId: fundId === '' ? null : Number(fundId) });
  }
}
