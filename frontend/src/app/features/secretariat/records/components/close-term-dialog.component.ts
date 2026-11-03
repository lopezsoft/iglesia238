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
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { PastoralTerm } from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { notAfterToday, showError } from './record-validators';

/** Puts an end date on the open term of a sede (the pastor leaves and the successor is not known yet). */
@Component({
  selector: 'app-close-term-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, DialogComponent, IconComponent],
  template: `
    <app-dialog [(open)]="open" title="Cerrar periodo pastoral">
      @if (term(); as target) {
        <form
          id="close-term-form"
          class="stack"
          [formGroup]="form"
          (ngSubmit)="submit(target)"
          novalidate
        >
          <div class="alert" role="note">
            <app-icon name="info" />
            <p class="text-small">
              <strong>{{ target.pastor.fullName }}</strong> en {{ target.congregationName }}, desde
              {{ target.startedOn | date: 'dd/MM/yyyy' }}. El periodo queda cerrado y la sede sin
              pastor vigente hasta que registres uno nuevo.
            </p>
          </div>
          <div class="field">
            <label for="close-date">Fecha de fin *</label>
            <input
              id="close-date"
              class="input"
              type="date"
              formControlName="endedOn"
              [min]="target.startedOn"
              [max]="today()"
              aria-describedby="close-date-error"
            />
            @if (invalid(form.controls.endedOn)) {
              <span id="close-date-error" class="field__error">{{ dateError() }}</span>
            }
          </div>
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
        <button type="submit" form="close-term-form" class="btn btn--danger" [disabled]="pending()">
          {{ pending() ? 'Cerrando…' : 'Cerrar periodo' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class CloseTermDialogComponent {
  private readonly repository = inject(RecordsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly term = input<PastoralTerm | null>(null);
  /** Today in Bogotá, from the API. */
  readonly today = input('');
  readonly saved = output<string>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);

  protected readonly form = this.fb.group({
    endedOn: this.fb.control('', [
      Validators.required,
      (control: AbstractControl<string>) => notAfterToday(this.today())(control),
      (control: AbstractControl<string>) => this.notBeforeStart(control),
    ]),
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        untracked(() => {
          this.form.reset({ endedOn: this.today() });
          this.submitted.set(false);
          this.error.set(null);
        });
      }
    });
  }

  protected invalid(control: AbstractControl): boolean {
    return showError(control, this.submitted());
  }

  protected dateError(): string {
    const control = this.form.controls.endedOn;
    if (control.hasError('futureDate')) {
      return 'No puede ser una fecha futura.';
    }
    return control.hasError('beforeStart')
      ? 'No puede ser anterior al inicio del periodo.'
      : 'Indica la fecha de fin.';
  }

  protected async submit(target: PastoralTerm): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.repository.closePastoralTerm(target.id, this.form.getRawValue().endedOn),
      );
      this.saved.emit(`Periodo de ${target.pastor.fullName} cerrado.`);
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private notBeforeStart(control: AbstractControl<string>): ValidationErrors | null {
    const startedOn = this.term()?.startedOn;
    return control.value && startedOn && control.value < startedOn ? { beforeStart: true } : null;
  }
}
