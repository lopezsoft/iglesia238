import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { VOID_REASON_MIN_LENGTH } from '../data/certificates.models';

let nextId = 0;

function trimmedMinLength(control: AbstractControl<string>): ValidationErrors | null {
  return control.value.trim().length >= VOID_REASON_MIN_LENGTH ? null : { reason: true };
}

/** Asks for the reason of a void. The parent runs the command and passes `pending` and `error`. */
@Component({
  selector: 'app-void-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DialogComponent, IconComponent],
  host: { '[attr.title]': 'null' },
  template: `
    <app-dialog [(open)]="open" [title]="title()">
      <form [id]="uid + '-form'" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <p class="text-muted">{{ subject() }}</p>
        <div class="alert alert--warning" [id]="uid + '-description'">
          <app-icon name="alert" />
          <span>{{ description() }}</span>
        </div>
        <div class="field">
          <label [for]="uid + '-reason'">Motivo de anulación *</label>
          <textarea
            [id]="uid + '-reason'"
            class="textarea"
            rows="3"
            formControlName="reason"
            maxlength="255"
            placeholder="Ej.: Error en el número de documento del miembro."
            [attr.aria-describedby]="uid + '-description'"
            [attr.aria-invalid]="showReasonError()"
          ></textarea>
          @if (showReasonError()) {
            <p class="field__error" role="alert">
              Escribe el motivo de la anulación (mínimo {{ minLength }} caracteres).
            </p>
          }
        </div>
        @if (error(); as message) {
          <div class="alert alert--danger" role="alert">
            <app-icon name="alert" />
            <span>{{ message }}</span>
          </div>
        }
      </form>
      <div dialog-footer>
        <button
          type="button"
          class="btn btn--secondary"
          [disabled]="pending()"
          (click)="open.set(false)"
        >
          Cancelar
        </button>
        <button
          type="submit"
          [attr.form]="uid + '-form'"
          class="btn btn--danger"
          [disabled]="pending()"
        >
          {{ pending() ? 'Anulando…' : confirmLabel() }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class VoidDialogComponent {
  readonly open = model(false);
  readonly title = input.required<string>();
  readonly subject = input.required<string>();
  readonly description = input.required<string>();
  readonly confirmLabel = input.required<string>();
  readonly pending = input(false);
  readonly error = input<string | null>(null);
  readonly confirmed = output<string>();

  protected readonly uid = `void-dialog-${nextId++}`;
  protected readonly minLength = VOID_REASON_MIN_LENGTH;
  protected readonly form = inject(NonNullableFormBuilder).group({
    reason: ['', [trimmedMinLength]],
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.form.reset({ reason: '' });
      }
    });
  }

  protected showReasonError(): boolean {
    const control = this.form.controls.reason;
    return control.touched && control.invalid;
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.confirmed.emit(this.form.controls.reason.value.trim());
  }
}
