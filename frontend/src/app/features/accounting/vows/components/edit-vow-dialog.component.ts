import { ChangeDetectionStrategy, Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { formatMoney } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { UpdateVowPledgeCommand, VowPledgeRow } from '../data/vows.models';
import { VowsRepository } from '../data/vows.repository';

/** Edits the amount, the deadline and the observations of a pledge that is not cancelled. */
@Component({
  selector: 'app-edit-vow-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, IconComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" [title]="'Editar promesa ' + (pledge()?.code ?? '')">
      @if (pledge(); as row) {
        <form id="edit-vow-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <p class="text-muted text-small">{{ row.personName }} · {{ row.typeName }}</p>
          <div class="form-grid">
            <div class="field">
              <label for="edit-vow-amount">Valor prometido (COP) *</label>
              <input id="edit-vow-amount" class="input mono" type="number" inputmode="numeric" min="1" step="1" formControlName="pledgedAmount" aria-describedby="edit-vow-amount-help" />
              <span id="edit-vow-amount-help" class="field__hint">No puede ser menor a lo ya abonado ({{ paidText(row) }}).</span>
              @if (form.controls.pledgedAmount.touched && form.controls.pledgedAmount.invalid) {
                <span class="field__error">{{ amountError(row) }}</span>
              }
            </div>
            <div class="field">
              <label for="edit-vow-due">Fecha límite</label>
              <input id="edit-vow-due" class="input" type="date" formControlName="dueOn" [attr.min]="row.pledgedOn" />
              <span class="field__hint">Opcional. Vacía la fecha para quitar el plazo.</span>
              @if (form.controls.dueOn.touched && form.controls.dueOn.invalid) {
                <span class="field__error">La fecha límite no puede ser anterior a la promesa ({{ row.pledgedOn }}).</span>
              }
            </div>
          </div>
          <div class="field">
            <label for="edit-vow-notes">Observaciones</label>
            <textarea id="edit-vow-notes" class="textarea" rows="3" maxlength="255" formControlName="description"></textarea>
          </div>
          @if (error()) {
            <div class="alert alert--danger" role="alert"><app-icon name="alert" /><span>{{ error() }}</span></div>
          }
        </form>
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button type="submit" form="edit-vow-form" class="btn btn--primary" [disabled]="pending()">
          {{ pending() ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class EditVowDialogComponent {
  private readonly repository = inject(VowsRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly open = model(false);
  readonly pledge = input<VowPledgeRow | null>(null);
  readonly updated = output<VowPledgeRow>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly form = this.fb.group({
    pledgedAmount: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(1),
      (control: AbstractControl<number | null>) => this.notBelowPaid(control),
    ]),
    dueOn: ['', (control: AbstractControl<string>) => this.notBeforePromise(control)],
    description: ['', Validators.maxLength(255)],
  });

  constructor() {
    effect(() => {
      const row = this.pledge();
      if (this.open() && row) {
        untracked(() => {
          this.error.set(null);
          this.form.reset({ pledgedAmount: row.pledgedAmount, dueOn: row.dueOn ?? '', description: row.description ?? '' });
        });
      }
    });
  }

  protected paidText(row: VowPledgeRow): string {
    return formatMoney(row.paid);
  }

  protected amountError(row: VowPledgeRow): string {
    return this.form.controls.pledgedAmount.hasError('belowPaid')
      ? `El valor no puede ser menor a lo ya abonado (${formatMoney(row.paid)}).`
      : 'Escribe un valor mayor que cero.';
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    const row = this.pledge();
    if (!row || this.form.invalid || this.pending()) {
      return;
    }
    const value = this.form.getRawValue();
    const command = this.changes(row, value);
    if (Object.keys(command).length === 0) {
      this.open.set(false);
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      this.updated.emit(await firstValueFrom(this.repository.update(row.id, command)));
      this.open.set(false);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  /** Only the fields that differ from the pledge travel to the API. */
  private changes(
    row: VowPledgeRow,
    value: { pledgedAmount: number | null; dueOn: string; description: string },
  ): UpdateVowPledgeCommand {
    const command: { -readonly [K in keyof UpdateVowPledgeCommand]: UpdateVowPledgeCommand[K] } = {};
    if (value.pledgedAmount !== null && Number(value.pledgedAmount) !== row.pledgedAmount) {
      command.pledgedAmount = Number(value.pledgedAmount);
    }
    if ((value.dueOn || null) !== row.dueOn) {
      command.dueOn = value.dueOn || null;
    }
    if ((value.description.trim() || null) !== row.description) {
      command.description = value.description.trim() || null;
    }
    return command;
  }

  private notBelowPaid(control: AbstractControl<number | null>): ValidationErrors | null {
    const paid = this.pledge()?.paid ?? 0;
    return control.value !== null && control.value < paid ? { belowPaid: true } : null;
  }

  private notBeforePromise(control: AbstractControl<string>): ValidationErrors | null {
    const promised = this.pledge()?.pledgedOn;
    return control.value && promised && control.value < promised ? { beforePromise: true } : null;
  }
}
