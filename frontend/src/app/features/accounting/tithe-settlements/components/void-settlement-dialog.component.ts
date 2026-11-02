import { DatePipe } from '@angular/common';
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
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { TitheSettlementRow } from '../data/tithe-settlements.models';
import { TitheSettlementsRepository } from '../data/tithe-settlements.repository';

/** "Anular liquidación": a reason is required; the tithes go back to recorded. */
@Component({
  selector: 'app-void-settlement-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DialogComponent, MoneyPipe, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="'Anular liquidación ' + (settlement()?.number ?? '')">
      @if (settlement(); as target) {
        <form id="void-settlement-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <p id="void-settlement-desc">
            La liquidación del rango {{ target.coveredFrom | date: 'dd/MM/yyyy' }} – {{ target.coveredTo | date: 'dd/MM/yyyy' }} por
            <span class="amount">{{ target.grossTithe | money }}</span> quedará como «Anulada». El registro no se elimina, sus
            movimientos de caja se reversan hoy y sus diezmos podrán liquidarse de nuevo.
          </p>
          <div class="field">
            <label for="void-settlement-reason">Motivo de anulación *</label>
            <textarea
              id="void-settlement-reason"
              class="textarea"
              rows="4"
              maxlength="255"
              formControlName="reason"
              aria-describedby="void-settlement-help"
              placeholder="Ej.: se omitieron aportes por transferencia del último día del rango"
            ></textarea>
            <span id="void-settlement-help" class="field__hint">Mínimo 10 caracteres. Queda registrado con tu usuario.</span>
            @if (form.controls.reason.touched && form.controls.reason.invalid) {
              <span class="field__error">Escribe un motivo de al menos 10 caracteres.</span>
            }
          </div>
          @if (error()) {
            <div class="alert alert--danger" role="alert">{{ error() }}</div>
          }
        </form>
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="void-settlement-form" class="btn btn--danger" [disabled]="pending() || !settlement()">
          {{ pending() ? 'Anulando…' : 'Anular liquidación' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class VoidSettlementDialogComponent {
  private readonly repository = inject(TitheSettlementsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly settlement = input.required<TitheSettlementRow | null>();
  readonly voided = output<TitheSettlementRow>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({
    reason: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(255)]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.error.set(null);
          this.form.reset({ reason: '' });
        });
      }
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const target = this.settlement();
    const reason = this.form.controls.reason.value.trim();
    if (this.form.invalid || reason.length < 10 || !target || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const row = await firstValueFrom(this.repository.void(target.id, reason));
      this.voided.emit(row);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
