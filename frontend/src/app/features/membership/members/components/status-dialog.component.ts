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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MEMBER_STATUS_LABELS, MemberStatus } from '../../../../core/models/membership.model';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { MANUAL_STATUS_TARGETS, MemberDetail, todayIso } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { CommandState } from './command-state';

const EFFECTS: Readonly<Partial<Record<MemberStatus, string>>> = {
  INACTIVE: 'Se cierran los cargos vigentes del miembro. Su registro en la sede se conserva.',
  DECEASED:
    'Se cierran los cargos vigentes y el registro en la sede. El estado no se puede revertir.',
  ACTIVE:
    'El miembro vuelve a figurar como activo. Si venía de un traslado a otra iglesia, se abre un nuevo registro con el siguiente número de la sede.',
};

/** Changes the status of the member (active, inactive, deceased) with a reason and a date. */
@Component({
  selector: 'app-status-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" title="Cambiar el estado del miembro">
      <form id="status-form" class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (command.error(); as text) {
          <p class="alert alert--danger" role="alert">{{ text }}</p>
        }
        <p class="text-muted text-small">
          Estado actual: <strong>{{ labels[member().status] }}</strong>
        </p>
        <div class="field">
          <label for="status-target">Nuevo estado *</label>
          <select id="status-target" class="select" formControlName="status">
            @for (target of targets(); track target) {
              <option [value]="target">{{ labels[target] }}</option>
            }
          </select>
          @if (effectText(); as text) {
            <span class="field__hint">{{ text }}</span>
          }
        </div>
        <div class="field">
          <label for="status-date">Fecha del cambio</label>
          <input
            id="status-date"
            class="input"
            type="date"
            formControlName="effectiveOn"
            [max]="today"
          />
          @if (submitted() && form.controls.effectiveOn.invalid) {
            <span class="field__error">La fecha no puede ser futura.</span>
          }
        </div>
        <div class="field">
          <label for="status-reason"
            >Motivo
            @if (reasonRequired()) {
              <span>*</span>
            }
          </label>
          <textarea
            id="status-reason"
            class="textarea"
            rows="3"
            maxlength="255"
            formControlName="reason"
          ></textarea>
          @if (submitted() && form.controls.reason.invalid) {
            <span class="field__error">Indica el motivo del cambio (mínimo 3 caracteres).</span>
          }
        </div>
      </form>

      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button
          type="submit"
          form="status-form"
          class="btn btn--primary"
          [disabled]="command.pending()"
        >
          {{ command.pending() ? 'Guardando…' : 'Cambiar estado' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class StatusDialogComponent {
  private readonly repository = inject(MembersRepository);

  readonly open = model(false);
  readonly member = input.required<MemberDetail>();
  readonly changed = output<void>();

  protected readonly labels = MEMBER_STATUS_LABELS;
  protected readonly today = todayIso();
  protected readonly command = new CommandState();
  protected readonly submitted = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    status: ['INACTIVE' as MemberStatus],
    effectiveOn: [todayIso()],
    reason: [''],
  });

  protected readonly targets = computed(() => MANUAL_STATUS_TARGETS[this.member().status]);
  private readonly selected = signal<MemberStatus>('INACTIVE');
  protected readonly reasonRequired = computed(() => this.selected() !== 'ACTIVE');
  protected readonly effectText = computed(() => EFFECTS[this.selected()] ?? null);

  constructor() {
    this.form.controls.status.valueChanges.pipe(takeUntilDestroyed()).subscribe((status) => {
      this.selected.set(status);
      this.applyValidators(status);
    });
    effect(() => {
      if (!this.open()) {
        return;
      }
      const first = this.targets()[0] ?? 'INACTIVE';
      untracked(() => {
        this.command.clear();
        this.submitted.set(false);
        this.form.reset({ status: first, effectiveOn: todayIso(), reason: '' });
        this.selected.set(first);
        this.applyValidators(first);
      });
    });
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const { status, effectiveOn, reason } = this.form.getRawValue();
    const done = await this.command.run(
      this.repository.changeStatus(this.member().id, {
        status,
        effectiveOn: effectiveOn === '' ? null : effectiveOn,
        reason: reason.trim() === '' ? null : reason.trim(),
      }),
      'Estado actualizado.',
    );
    if (done) {
      this.open.set(false);
      this.changed.emit();
    }
  }

  private applyValidators(status: MemberStatus): void {
    const { reason, effectiveOn } = this.form.controls;
    reason.setValidators(
      status === 'ACTIVE'
        ? [Validators.maxLength(255)]
        : [Validators.required, Validators.minLength(3), Validators.maxLength(255)],
    );
    effectiveOn.setValidators((control) =>
      control.value && control.value > todayIso() ? { future: true } : null,
    );
    reason.updateValueAndValidity({ emitEvent: false });
    effectiveOn.updateValueAndValidity({ emitEvent: false });
  }
}
