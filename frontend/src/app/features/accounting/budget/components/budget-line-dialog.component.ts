import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { formatMoney } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { BUDGET_TYPE_LABELS, BudgetType } from '../../data/accounting.models';
import { BudgetAccountOption, BudgetLineRow, BudgetOption } from '../data/budget.models';
import { BudgetRepository } from '../data/budget.repository';

/** Add or edit a budget line: account + fund (the committee on a committee budget), annual > 0. */
@Component({
  selector: 'app-budget-line-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule, RouterLink],
  template: `
    <app-dialog [(open)]="open" [title]="title()">
      <form id="budget-line-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="text-muted text-small">Una línea por cuenta y {{ isCommittee() ? 'comité' : 'fondo' }}. Los campos con * son obligatorios.</p>
        <div class="field">
          <label for="budget-line-fund">{{ isCommittee() ? 'Comité *' : 'Fondo *' }}</label>
          <select id="budget-line-fund" class="select" formControlName="fundId">
            <option [ngValue]="null" disabled>{{ isCommittee() ? 'Selecciona un comité' : 'Selecciona un fondo' }}</option>
            @for (fund of funds(); track fund.id) {
              <option [ngValue]="fund.id">{{ fund.label }}</option>
            }
          </select>
          @if (form.controls.fundId.touched && form.controls.fundId.invalid) {
            <span class="field__error">{{ isCommittee() ? 'Selecciona el comité de la línea.' : 'Selecciona el fondo de la línea.' }}</span>
          }
        </div>
        <div class="field">
          <label for="budget-line-account">Cuenta *</label>
          <select id="budget-line-account" class="select" formControlName="accountId" aria-describedby="budget-line-account-help">
            <option [ngValue]="null" disabled>Selecciona una cuenta</option>
            @for (account of accounts(); track account.id) {
              <option [ngValue]="account.id">{{ account.label }}</option>
            }
          </select>
          <span id="budget-line-account-help" class="field__hint">
            Solo cuentas imputables. ¿Falta una? Créala en <a routerLink="/accounting/setup">Configuración contable</a>.
          </span>
          @if (form.controls.accountId.touched && form.controls.accountId.invalid) {
            <span class="field__error">Selecciona una cuenta imputable.</span>
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="budget-line-annual">Valor anual (COP) *</label>
            <input id="budget-line-annual" class="input mono" type="number" inputmode="numeric" min="1" step="1" formControlName="annualAmount" aria-describedby="budget-line-annual-help" />
            <span id="budget-line-annual-help" class="field__hint">{{ annualHelp() }}</span>
            @if (form.controls.annualAmount.touched && form.controls.annualAmount.invalid) {
              <span class="field__error">Ingresa un valor anual mayor que cero.</span>
            }
          </div>
          <div class="field">
            <label for="budget-line-monthly">Valor mensual (opcional)</label>
            <input id="budget-line-monthly" class="input mono" type="number" inputmode="numeric" min="1" step="1" formControlName="monthlyAmount" aria-describedby="budget-line-monthly-help" />
            <span id="budget-line-monthly-help" class="field__hint">Para gastos recurrentes. Si lo dejas vacío, se usa solo el valor anual.</span>
            @if (form.controls.monthlyAmount.touched && form.controls.monthlyAmount.invalid) {
              <span class="field__error">Si lo indicas, debe ser mayor que cero.</span>
            }
          </div>
        </div>
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="budget-line-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Guardando…' : 'Guardar línea' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class BudgetLineDialogComponent {
  private readonly repository = inject(BudgetRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  /** Null to add a line. */
  readonly line = input<BudgetLineRow | null>(null);
  readonly type = input.required<BudgetType>();
  readonly year = input.required<number>();
  readonly accounts = input.required<readonly BudgetAccountOption[]>();
  readonly funds = input.required<readonly BudgetOption[]>();
  readonly saved = output<BudgetLineRow>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isCommittee = computed(() => this.type() === 'COMMITTEE');
  protected readonly title = computed(
    () => `${this.line() ? 'Editar línea' : 'Nueva línea'} · ${BUDGET_TYPE_LABELS[this.type()].toLowerCase()} ${this.year()}`,
  );

  protected readonly form = this.fb.group({
    fundId: this.fb.control<number | null>(null, Validators.required),
    accountId: this.fb.control<number | null>(null, Validators.required),
    annualAmount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    monthlyAmount: this.fb.control<number | null>(null, Validators.min(1)),
  });

  private readonly annual = toSignal(this.form.controls.annualAmount.valueChanges, { initialValue: null });
  protected readonly annualHelp = computed(() => {
    const annual = Number(this.annual() ?? 0);
    return annual > 0
      ? `Equivale a ${formatMoney(Math.round(annual / 12))} por mes.`
      : `Monto total del año para esta cuenta y ${this.isCommittee() ? 'comité' : 'fondo'}.`;
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || value.accountId === null || value.fundId === null || value.annualAmount === null || this.pending()) {
      return;
    }
    const monthly = value.monthlyAmount === null || String(value.monthlyAmount) === '' ? null : Number(value.monthlyAmount);
    this.pending.set(true);
    this.error.set(null);
    try {
      const row = await firstValueFrom(
        this.repository.saveLine({
          id: this.line()?.id ?? null,
          year: this.year(),
          type: this.type(),
          accountId: value.accountId,
          fundId: value.fundId,
          annualAmount: Number(value.annualAmount),
          monthlyAmount: monthly,
        }),
      );
      this.saved.emit(row);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private reset(): void {
    const line = this.line();
    this.error.set(null);
    this.form.reset({
      fundId: line?.fundId ?? null,
      accountId: line?.accountId ?? null,
      annualAmount: line?.annualAmount ?? null,
      monthlyAmount: line?.monthlyAmount ?? null,
    });
  }
}
