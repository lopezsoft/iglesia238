import { ChangeDetectionStrategy, Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { BUDGET_TYPE_LABELS, BudgetType } from '../../data/accounting.models';
import { CopyBudgetResult } from '../data/budget.models';
import { BudgetRepository } from '../data/budget.repository';

/** Starts the budget of the selected year from another one, optionally adjusting every amount. */
@Component({
  selector: 'app-budget-copy-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="'Copiar presupuesto a ' + targetYear()">
      <form id="budget-copy-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="text-muted text-small">
          Copia las líneas del {{ typeLabel().toLowerCase() }} de otro año a {{ targetYear() }} como borrador. Las líneas que ya
          existen y las de cuentas o fondos inactivos se omiten.
        </p>
        <div class="field">
          <label for="budget-copy-source">Copiar desde el año *</label>
          <select id="budget-copy-source" class="select" formControlName="sourceYear">
            @for (year of sourceYears(); track year) {
              <option [ngValue]="year">{{ year }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="budget-copy-rate">Ajuste porcentual (opcional)</label>
          <input
            id="budget-copy-rate"
            class="input mono"
            type="number"
            inputmode="decimal"
            step="0.5"
            min="-99"
            max="1000"
            formControlName="adjustment"
            aria-describedby="budget-copy-rate-help"
          />
          <span id="budget-copy-rate-help" class="field__hint">
            Ej.: 5 aumenta todos los valores un 5 %; -3 los reduce un 3 %. Vacío copia los valores tal cual.
          </span>
          @if (form.controls.adjustment.touched && form.controls.adjustment.invalid) {
            <span class="field__error">Ingresa un porcentaje entre -99 y 1000.</span>
          }
        </div>
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="budget-copy-form" class="btn btn--primary" [disabled]="pending() || sourceYears().length === 0">
          {{ pending() ? 'Copiando…' : 'Copiar líneas' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class BudgetCopyDialogComponent {
  private readonly repository = inject(BudgetRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly type = input.required<BudgetType>();
  readonly targetYear = input.required<number>();
  /** Years that may hold a budget to copy from (never the target year). */
  readonly years = input.required<readonly number[]>();
  readonly copied = output<CopyBudgetResult>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({
    sourceYear: this.fb.control<number | null>(null, Validators.required),
    adjustment: this.fb.control<number | null>(null, [Validators.min(-99), Validators.max(1000)]),
  });

  protected sourceYears(): readonly number[] {
    return this.years().filter((year) => year !== this.targetYear());
  }

  protected typeLabel(): string {
    return BUDGET_TYPE_LABELS[this.type()];
  }

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.error.set(null);
          this.form.reset({ sourceYear: this.sourceYears()[0] ?? null, adjustment: null });
        });
      }
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const { sourceYear, adjustment } = this.form.getRawValue();
    if (this.form.invalid || sourceYear === null || this.pending()) {
      return;
    }
    const percent = adjustment === null || String(adjustment) === '' ? null : Number(adjustment);
    this.pending.set(true);
    this.error.set(null);
    try {
      const result = await firstValueFrom(
        this.repository.copy({
          type: this.type(),
          sourceYear,
          targetYear: this.targetYear(),
          adjustmentRate: percent === null ? null : Math.round(percent * 100) / 10_000,
        }),
      );
      this.copied.emit(result);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
