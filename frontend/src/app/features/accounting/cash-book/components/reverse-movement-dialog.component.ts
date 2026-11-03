import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { CashBookRow, CashMovementReceipt } from '../data/cash-book.models';
import { CashBookRepository } from '../data/cash-book.repository';

/** "Reversar": same account, fund and amount, opposite direction, dated in an open period. */
@Component({
  selector: 'app-reverse-movement-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, MoneyPipe, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="'Reversar comprobante ' + (row()?.voucherCode ?? '')">
      @if (row(); as target) {
        <form id="reverse-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="alert" role="note">
            <span>
              La reversa usa la misma cuenta, fondo e importe con sentido contrario. El comprobante original queda como
              Reversado y no se elimina.
            </span>
          </div>
          <dl class="details">
            <div>
              <dt>Cuenta</dt>
              <dd><span class="mono">{{ target.accountCode }}</span> {{ target.accountName }}</dd>
            </div>
            <div>
              <dt>Fondo</dt>
              <dd>{{ fundName() }}</dd>
            </div>
            <div>
              <dt>Importe</dt>
              <dd class="amount">{{ target.amount | money }}</dd>
            </div>
            <div>
              <dt>Sentido</dt>
              <dd>{{ target.direction === 'IN' ? 'Entrada → Salida' : 'Salida → Entrada' }}</dd>
            </div>
            <div>
              <dt>Nuevo comprobante</dt>
              <dd class="mono">{{ target.direction === 'IN' ? nextCashOut() : nextCashIn() }}</dd>
            </div>
          </dl>
          <div class="field">
            <label for="reverse-date">Fecha de la reversa *</label>
            <input
              id="reverse-date"
              class="input"
              type="date"
              formControlName="postedOn"
              [attr.min]="openRange()?.min"
              [attr.max]="openRange()?.max"
              aria-describedby="reverse-date-help"
            />
            <span id="reverse-date-help" class="field__hint">Debe caer en un periodo abierto de la sede y no ser posterior a hoy.</span>
            @if (form.controls.postedOn.touched && form.controls.postedOn.invalid) {
              <span class="field__error">Elige una fecha de un periodo abierto.</span>
            }
          </div>
          <div class="field">
            <label for="reverse-reason">Motivo de la reversa *</label>
            <textarea
              id="reverse-reason"
              class="textarea"
              rows="3"
              maxlength="200"
              formControlName="reason"
              aria-describedby="reverse-reason-help"
              placeholder="Ej.: Valor registrado en la cuenta equivocada; se registrará de nuevo."
            ></textarea>
            <span id="reverse-reason-help" class="field__hint">Mínimo 10 caracteres. Queda en la descripción de la reversa.</span>
            @if (form.controls.reason.touched && form.controls.reason.invalid) {
              <span class="field__error">Describe el motivo (mínimo 10 caracteres).</span>
            }
          </div>
          @if (error()) {
            <div class="alert alert--danger" role="alert">{{ error() }}</div>
          }
        </form>
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="reverse-form" class="btn btn--danger" [disabled]="pending() || !row()">
          {{ pending() ? 'Registrando…' : 'Registrar reversa' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class ReverseMovementDialogComponent {
  private readonly repository = inject(CashBookRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly row = input.required<CashBookRow | null>();
  readonly fundName = input.required<string>();
  readonly today = input.required<string>();
  readonly openRange = input.required<{ readonly min: string; readonly max: string } | null>();
  readonly nextCashIn = input.required<string>();
  readonly nextCashOut = input.required<string>();
  readonly reversed = output<CashMovementReceipt>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    postedOn: ['', [Validators.required, (control: AbstractControl<string>) => this.insideOpenRange(control)]],
    reason: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(200)]],
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
    const target = this.row();
    if (this.form.invalid || !target || this.pending()) {
      return;
    }
    const value = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    try {
      const receipt = await firstValueFrom(
        this.repository.reverse({ transactionId: target.id, postedOn: value.postedOn, reason: value.reason.trim() }),
      );
      this.reversed.emit(receipt);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private insideOpenRange(control: AbstractControl<string>): ValidationErrors | null {
    // The form is built before the inputs are bound: read them only once there is a date to check.
    if (!control.value) {
      return null;
    }
    const range = this.openRange();
    return !range || control.value < range.min || control.value > range.max ? { closedPeriod: true } : null;
  }

  private reset(): void {
    const range = this.openRange();
    const today = this.today();
    const date = range && (today < range.min || today > range.max) ? range.min : today;
    this.error.set(null);
    this.form.reset({ postedOn: date, reason: '' });
  }
}
