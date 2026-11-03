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
import {
  AbstractControl,
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  MARRIAGE_END_REASONS,
  MARRIAGE_END_REASON_LABELS,
  Marriage,
  MarriageEndReason,
} from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { notAfterToday, showError } from './record-validators';

/** Records the end of a marriage. The record is kept with status Disuelto. */
@Component({
  selector: 'app-dissolution-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, DialogComponent, IconComponent],
  template: `
    <app-dialog [(open)]="open" title="Registrar disolución">
      @if (marriage(); as target) {
        <form
          id="dissolution-form"
          class="stack"
          [formGroup]="form"
          (ngSubmit)="submit(target)"
          novalidate
        >
          <div class="alert" role="note">
            <div>
              <p class="text-small">
                Matrimonio <span class="mono">{{ target.code }}</span>
                @if (target.marriedOn) {
                  · celebrado el {{ target.marriedOn | date: 'dd/MM/yyyy' }}
                }
              </p>
              <strong>{{ target.spouse1.fullName }} y {{ target.spouse2.fullName }}</strong>
            </div>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="dis-date">Fecha de disolución *</label>
              <input
                id="dis-date"
                class="input"
                type="date"
                formControlName="endedOn"
                [min]="target.marriedOn ?? ''"
                [max]="today()"
                aria-describedby="dis-date-error"
              />
              @if (invalid(form.controls.endedOn)) {
                <span id="dis-date-error" class="field__error">{{ dateError(target) }}</span>
              }
            </div>
            <div class="field">
              <label for="dis-reason">Motivo *</label>
              <select
                id="dis-reason"
                class="select"
                formControlName="endReason"
                aria-describedby="dis-reason-error"
              >
                <option [ngValue]="null" disabled>Selecciona el motivo</option>
                @for (reason of reasons; track reason) {
                  <option [ngValue]="reason">{{ reasonLabels[reason] }}</option>
                }
              </select>
              @if (invalid(form.controls.endReason)) {
                <span id="dis-reason-error" class="field__error"
                  >Selecciona el motivo de la disolución.</span
                >
              }
            </div>
          </div>

          <p class="field__hint">
            No registres aquí detalles íntimos ni motivos personales de la pareja.
          </p>
          <p class="text-muted text-small">
            El registro no se elimina: su estado cambia a Disuelto y la acción queda en auditoría
            con tu usuario.
          </p>

          @if (error(); as message) {
            <div class="alert alert--danger" role="alert">
              <app-icon name="alert" />
              <span>{{ message }}</span>
            </div>
          }
        </form>
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button
          type="submit"
          form="dissolution-form"
          class="btn btn--danger"
          [disabled]="pending()"
        >
          {{ pending() ? 'Registrando…' : 'Registrar disolución' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class DissolutionDialogComponent {
  private readonly repository = inject(RecordsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly marriage = input<Marriage | null>(null);
  /** Today in Bogotá, from the API. */
  readonly today = input('');
  readonly saved = output<string>();

  protected readonly reasons = MARRIAGE_END_REASONS;
  protected readonly reasonLabels = MARRIAGE_END_REASON_LABELS;
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    endedOn: this.fb.control('', [
      Validators.required,
      (control: AbstractControl<string>) => notAfterToday(this.today())(control),
      (control: AbstractControl<string>) => this.notBeforeMarriage(control),
    ]),
    endReason: new FormControl<MarriageEndReason | null>(null, Validators.required),
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.form.reset({ endedOn: this.today(), endReason: null });
          this.submitted.set(false);
          this.error.set(null);
        });
      }
    });
  }

  protected invalid(control: AbstractControl): boolean {
    return showError(control, this.submitted());
  }

  protected dateError(target: Marriage): string {
    const control = this.form.controls.endedOn;
    if (control.hasError('futureDate')) {
      return 'No puede ser una fecha futura.';
    }
    if (control.hasError('beforeMarriage') && target.marriedOn) {
      return 'No puede ser anterior a la fecha del matrimonio.';
    }
    return 'Indica la fecha de disolución.';
  }

  protected async submit(target: Marriage): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    const value = this.form.getRawValue();
    this.pending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.repository.dissolveMarriage(target.id, {
          endedOn: value.endedOn,
          endReason: value.endReason as MarriageEndReason,
        }),
      );
      this.saved.emit(`Se registró la disolución del matrimonio ${target.code}.`);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private notBeforeMarriage(control: AbstractControl<string>): ValidationErrors | null {
    const marriedOn = this.marriage()?.marriedOn;
    return control.value && marriedOn && control.value < marriedOn
      ? { beforeMarriage: true }
      : null;
  }
}
