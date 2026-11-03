import { ChangeDetectionStrategy, Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { VowPledgeRow } from '../data/vows.models';
import { VowsRepository } from '../data/vows.repository';

const MIN_REASON = 10;

/** Cancels an active pledge with a reason. Its payments stay: they are contributions with receipts. */
@Component({
  selector: 'app-cancel-vow-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, IconComponent, MoneyPipe, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="'Cancelar promesa ' + (pledge()?.code ?? '')">
      @if (pledge(); as row) {
        <form id="cancel-vow-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <p class="text-muted">
            La promesa deja de aceptar abonos. Lo ya abonado se conserva con sus recibos y la promesa queda cancelada con su
            motivo. Esta acción queda en la auditoría.
          </p>
          <dl class="details">
            <div><dt>Persona</dt><dd>{{ row.personName }}</dd></div>
            <div><dt>Prometido</dt><dd class="amount">{{ row.pledgedAmount | money }}</dd></div>
            <div><dt>Abonado</dt><dd class="amount">{{ row.paid | money }}</dd></div>
            <div><dt>Saldo que se deja de cobrar</dt><dd class="amount">{{ row.balance | money }}</dd></div>
          </dl>
          <div class="field">
            <label for="cancel-vow-reason">Motivo de la cancelación *</label>
            <textarea
              id="cancel-vow-reason"
              class="textarea"
              rows="3"
              maxlength="255"
              formControlName="reason"
              placeholder="Ej.: El miembro se trasladó de ciudad y no podrá cumplir la promesa."
              aria-describedby="cancel-vow-help"
            ></textarea>
            @if (form.controls.reason.touched && form.controls.reason.invalid) {
              <span class="field__error">Describe el motivo (mínimo 10 caracteres).</span>
            }
            <span id="cancel-vow-help" class="field__hint">Mínimo 10 caracteres.</span>
          </div>
          @if (error()) {
            <div class="alert alert--danger" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
          }
        </form>
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Volver</button>
        <button type="submit" form="cancel-vow-form" class="btn btn--danger" [disabled]="pending()">
          {{ pending() ? 'Cancelando…' : 'Cancelar promesa' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class CancelVowDialogComponent {
  private readonly repository = inject(VowsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly pledge = input<VowPledgeRow | null>(null);
  readonly cancelled = output<VowPledgeRow>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({
    reason: ['', [Validators.required, Validators.minLength(MIN_REASON), Validators.maxLength(255)]],
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
    const row = this.pledge();
    const reason = this.form.controls.reason.value.trim();
    if (reason.length < MIN_REASON) {
      // Spaces alone do not count as a reason.
      this.form.controls.reason.setErrors({ minlength: true });
    }
    if (!row || this.form.invalid || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const updated = await firstValueFrom(this.repository.cancel(row.id, reason));
      this.cancelled.emit(updated);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
