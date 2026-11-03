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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { CashDirection } from '../../data/accounting.models';
import { CashAccountOption, CashMovementReceipt, CashPeriodOption } from '../data/cash-book.models';
import { CashBookRepository } from '../data/cash-book.repository';

const MAX_DESCRIPTION = 255;

/** "Nuevo movimiento": an IN or OUT line of the selected fund, dated inside the open period. */
@Component({
  selector: 'app-new-movement-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" title="Nuevo movimiento">
      <form id="new-movement-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="text-muted text-small">{{ fundName() }} · {{ period().label }}</p>
        <div class="form-grid">
          <div class="field">
            <label for="new-movement-direction">Tipo *</label>
            <select id="new-movement-direction" class="select" formControlName="direction">
              <option value="OUT">Salida (comprobante de egreso)</option>
              <option value="IN">Entrada (comprobante de ingreso)</option>
            </select>
          </div>
          <div class="field">
            <label for="new-movement-date">Fecha *</label>
            <input
              id="new-movement-date"
              class="input"
              type="date"
              formControlName="postedOn"
              [attr.min]="period().from"
              [attr.max]="maxDate()"
              aria-describedby="new-movement-date-help"
            />
            <span id="new-movement-date-help" class="field__hint">Debe estar dentro del periodo abierto y no ser posterior a hoy.</span>
            @if (form.controls.postedOn.touched && form.controls.postedOn.invalid) {
              <span class="field__error">Elige una fecha de {{ period().label }} que no sea posterior a hoy.</span>
            }
          </div>
        </div>
        <div class="field">
          <label for="new-movement-account">Cuenta imputable *</label>
          <select id="new-movement-account" class="select" formControlName="accountId" aria-describedby="new-movement-account-help">
            <option [ngValue]="null" disabled>Selecciona una cuenta</option>
            @for (account of accountOptions(); track account.id) {
              <option [ngValue]="account.id">{{ account.code }} · {{ account.name }}</option>
            }
          </select>
          <span id="new-movement-account-help" class="field__hint">
            Las cuentas agrupadoras no reciben movimientos; solo se listan las imputables de
            {{ direction() === 'IN' ? 'ingreso' : 'egreso' }}.
          </span>
          @if (form.controls.accountId.touched && form.controls.accountId.invalid) {
            <span class="field__error">Selecciona la cuenta del movimiento.</span>
          }
        </div>
        <div class="field">
          <label for="new-movement-description">Descripción *</label>
          <input id="new-movement-description" class="input" type="text" maxlength="200" formControlName="description" placeholder="Ej.: Pago servicio de energía de octubre" />
          @if (form.controls.description.touched && form.controls.description.invalid) {
            <span class="field__error">Describe el movimiento (mínimo 3 caracteres).</span>
          }
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="new-movement-amount">Importe (COP) *</label>
            <input id="new-movement-amount" class="input mono" type="number" inputmode="numeric" min="1" step="1" formControlName="amount" aria-describedby="new-movement-amount-help" />
            <span id="new-movement-amount-help" class="field__hint">Mayor que cero, sin decimales.</span>
            @if (form.controls.amount.touched && form.controls.amount.invalid) {
              <span class="field__error">Escribe un valor mayor que cero.</span>
            }
          </div>
          <div class="field">
            <label for="new-movement-support">Soporte (factura o recibo)</label>
            <input id="new-movement-support" class="input" type="text" maxlength="50" formControlName="support" placeholder="Ej.: Factura 88412" />
          </div>
        </div>
        <p class="text-small">
          Se asignará el comprobante <span class="chip chip--mono">{{ direction() === 'IN' ? nextCashIn() : nextCashOut() }}</span> al registrar.
        </p>
        @if (error()) {
          <div class="alert alert--danger" role="alert">{{ error() }}</div>
        }
      </form>
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="new-movement-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Registrando…' : 'Registrar movimiento' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class NewMovementDialogComponent {
  private readonly repository = inject(CashBookRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly fundId = input.required<number>();
  readonly fundName = input.required<string>();
  readonly period = input.required<CashPeriodOption>();
  readonly accounts = input.required<readonly CashAccountOption[]>();
  readonly today = input.required<string>();
  readonly nextCashIn = input.required<string>();
  readonly nextCashOut = input.required<string>();
  readonly recorded = output<CashMovementReceipt>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    direction: this.fb.control<CashDirection>('OUT'),
    postedOn: ['', [Validators.required, (control: AbstractControl<string>) => this.insidePeriod(control)]],
    accountId: this.fb.control<number | null>(null, Validators.required),
    description: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    support: ['', Validators.maxLength(50)],
  });

  /** Last valid date: the end of the period or today, whichever comes first. */
  protected readonly maxDate = computed(() => {
    const { to } = this.period();
    return to < this.today() ? to : this.today();
  });

  protected readonly direction = toSignal(this.form.controls.direction.valueChanges, { initialValue: 'OUT' as CashDirection });
  protected readonly accountOptions = computed(() => {
    const nature = this.direction() === 'IN' ? 'INCOME' : 'EXPENSE';
    return this.accounts().filter((a) => a.nature === nature);
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => this.reset());
      }
    });
    this.form.controls.direction.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.accountId.setValue(null));
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (this.form.invalid || value.accountId === null || value.amount === null || this.pending()) {
      return;
    }
    const support = value.support.trim();
    const description = (support ? `${value.description.trim()} (${support})` : value.description.trim()).slice(0, MAX_DESCRIPTION);
    this.pending.set(true);
    this.error.set(null);
    try {
      const receipt = await firstValueFrom(
        this.repository.record({
          fundId: this.fundId(),
          direction: value.direction,
          accountId: value.accountId,
          postedOn: value.postedOn,
          amount: Number(value.amount),
          description,
        }),
      );
      this.recorded.emit(receipt);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private insidePeriod(control: AbstractControl<string>): ValidationErrors | null {
    // The form is built before the inputs are bound: read them only once there is a date to check.
    if (!control.value) {
      return null;
    }
    const { from } = this.period();
    return control.value < from || control.value > this.maxDate() ? { outsidePeriod: true } : null;
  }

  private reset(): void {
    const { from, to } = this.period();
    const today = this.today();
    this.error.set(null);
    this.form.reset({
      direction: 'OUT',
      postedOn: today >= from && today <= to ? today : from,
      accountId: null,
      description: '',
      amount: null,
      support: '',
    });
  }
}
