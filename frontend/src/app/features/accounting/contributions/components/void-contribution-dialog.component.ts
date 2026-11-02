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
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ContributionRow } from '../data/contributions.models';
import { ContributionsRepository } from '../data/contributions.repository';

/** Voids a recorded contribution with a mandatory reason; the row is kept for auditing. */
@Component({
  selector: 'app-void-contribution-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DialogComponent, IconComponent, MoneyPipe, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="'Anular aporte ' + (contribution()?.receiptNumber ?? '')">
      @if (contribution(); as row) {
        <form id="void-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <p class="text-muted">
            El aporte se conserva con estado Anulado y deja de sumar en los totales. Si ya tiene su propio movimiento en el
            Libro de caja, se registra la reversa con fecha de hoy. Esta acción queda en la auditoría.
          </p>
          <dl class="details">
            <div><dt>Aportante</dt><dd>{{ row.contributorName ?? 'Anónimo' }}</dd></div>
            <div><dt>Tipo</dt><dd>{{ row.typeName }}</dd></div>
            <div><dt>Fecha</dt><dd>{{ row.receivedOn | date: 'dd/MM/yyyy' }}</dd></div>
            <div><dt>Valor</dt><dd class="amount">{{ row.amount | money }}</dd></div>
          </dl>
          <div class="field">
            <label for="void-reason">Motivo de la anulación *</label>
            <textarea
              id="void-reason"
              class="textarea"
              rows="3"
              maxlength="255"
              formControlName="reason"
              placeholder="Ej.: Valor digitado con error; se registra de nuevo con el valor correcto."
              aria-describedby="void-help"
            ></textarea>
            @if (form.controls.reason.touched && form.controls.reason.invalid) {
              <span class="field__error">Describe el motivo de la anulación (mínimo 10 caracteres).</span>
            }
            <span id="void-help" class="field__hint">Mínimo 10 caracteres. El motivo es visible para el Pastor y en Auditoría.</span>
          </div>
          <div class="alert alert--warning" role="note">
            <app-icon name="alert" />
            <span>Un aporte liquidado no se puede anular. Este aporte aún no está incluido en ninguna liquidación del diezmo.</span>
          </div>
          @if (error()) {
            <div class="alert alert--danger" role="alert">{{ error() }}</div>
          }
        </form>
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="void-form" class="btn btn--danger" [disabled]="pending()">
          {{ pending() ? 'Anulando…' : 'Confirmar anulación' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class VoidContributionDialogComponent {
  private readonly repository = inject(ContributionsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly contribution = input<ContributionRow | null>(null);
  readonly voided = output<ContributionRow>();

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
    const row = this.contribution();
    const reason = this.form.controls.reason.value.trim();
    if (reason.length < 10) {
      // Spaces alone do not count as a reason.
      this.form.controls.reason.setErrors({ minlength: true });
    }
    if (!row || this.form.invalid || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const updated = await firstValueFrom(this.repository.void(row.id, reason));
      this.voided.emit(updated);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
