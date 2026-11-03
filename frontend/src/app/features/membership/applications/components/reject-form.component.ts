import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { map } from 'rxjs';
import {
  REJECTION_REASON_MAX_LENGTH,
  REJECTION_REASON_MIN_LENGTH,
} from '../data/applications.models';

function minTrimmedLength(min: number) {
  return (control: AbstractControl<string>): ValidationErrors | null =>
    control.value.trim().length >= min ? null : { minTrimmedLength: { min } };
}

/**
 * Reason of a rejection. It is an internal note for the secretariat and the audit: the applicant
 * only sees that the application was not approved and is told to contact the sede.
 */
@Component({
  selector: 'app-reject-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  styles: `
    :host {
      display: block;
    }
    .reject-form__actions {
      justify-content: flex-end;
    }
  `,
  template: `
    <form class="card stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <div class="field">
        <label for="reject-reason">Motivo del rechazo *</label>
        <textarea
          id="reject-reason"
          class="textarea"
          rows="3"
          formControlName="reason"
          [attr.maxlength]="maxLength"
          aria-describedby="reject-reason-help"
          [attr.aria-invalid]="showError()"
          placeholder="Ej.: El documento no coincide con la persona. Se le pidió corregirlo en la secretaría."
        ></textarea>
        <span id="reject-reason-help" class="field__hint">
          Es una nota interna: el solicitante no la ve. Solo sabrá que su solicitud no fue aprobada y
          que debe comunicarse con la secretaría. Mínimo {{ minLength }} caracteres
          ({{ reason().length }}/{{ maxLength }}).
        </span>
        @if (showError()) {
          <span class="field__error" role="alert">
            Escribe un motivo de entre {{ minLength }} y {{ maxLength }} caracteres.
          </span>
        }
      </div>
      <div class="cluster reject-form__actions">
        <button
          type="button"
          class="btn btn--secondary"
          [disabled]="pending()"
          (click)="cancelled.emit()"
        >
          Cancelar
        </button>
        <button type="submit" class="btn btn--danger" [disabled]="pending()">
          {{ pending() ? 'Rechazando…' : 'Confirmar rechazo' }}
        </button>
      </div>
    </form>
  `,
})
export class RejectFormComponent {
  readonly pending = input(false);
  readonly submitted = output<string>();
  readonly cancelled = output<void>();

  protected readonly minLength = REJECTION_REASON_MIN_LENGTH;
  protected readonly maxLength = REJECTION_REASON_MAX_LENGTH;

  protected readonly form = inject(NonNullableFormBuilder).group({
    reason: [
      '',
      [
        Validators.required,
        Validators.maxLength(REJECTION_REASON_MAX_LENGTH),
        minTrimmedLength(REJECTION_REASON_MIN_LENGTH),
      ],
    ],
  });

  private readonly control = this.form.controls.reason;

  /** Snapshot of the control, refreshed on every value, status or touched event. */
  protected readonly reason = toSignal(this.control.events.pipe(map(() => this.snapshot())), {
    initialValue: this.snapshot(),
  });
  protected readonly showError = computed(() => this.reason().touched && this.reason().invalid);

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    this.submitted.emit(this.control.value.trim());
  }

  private snapshot(): { length: number; touched: boolean; invalid: boolean } {
    return {
      length: this.control.value.length,
      touched: this.control.touched,
      invalid: this.control.invalid,
    };
  }
}
