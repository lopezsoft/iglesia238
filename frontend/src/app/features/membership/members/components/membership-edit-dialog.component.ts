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
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { MemberDetail, MembershipDataInput, todayIso } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';

type BaptismChoice = '' | 'YES' | 'NO';

/** Edits the data of the file that belong to the membership, not to the person: join date and baptism. */
@Component({
  selector: 'app-membership-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" title="Editar datos de membresía">
      <form
        id="membership-edit-form"
        class="stack"
        [formGroup]="form"
        (ngSubmit)="submit()"
        novalidate
      >
        @if (error(); as message) {
          <p class="alert alert--danger" role="alert">{{ message }}</p>
        }
        <div class="form-grid">
          <div class="field">
            <label for="membership-joined-on">Fecha de ingreso</label>
            <input
              id="membership-joined-on"
              class="input"
              type="date"
              formControlName="joinedOn"
              [max]="today"
            />
          </div>
          <div class="field">
            <label for="membership-baptized">Bautismo en agua</label>
            <select id="membership-baptized" class="select" formControlName="baptism">
              <option value="">Sin dato</option>
              <option value="YES">Bautizado(a)</option>
              <option value="NO">No bautizado(a)</option>
            </select>
          </div>
          @if (form.controls.baptism.value === 'YES') {
            <div class="field">
              <label for="membership-baptism-date">Fecha del bautismo</label>
              <input
                id="membership-baptism-date"
                class="input"
                type="date"
                formControlName="waterBaptismOn"
                [max]="today"
              />
            </div>
            <div class="field">
              <label for="membership-baptism-place">Lugar del bautismo</label>
              <input id="membership-baptism-place" class="input" formControlName="baptismPlace" />
              @if (form.controls.baptismPlace.invalid) {
                <span class="field__error">Máximo 150 caracteres.</span>
              }
            </div>
          }
          <div class="field">
            <label for="membership-previous">Iglesia o sede anterior</label>
            <input
              id="membership-previous"
              class="input"
              formControlName="previousCongregationName"
            />
            @if (form.controls.previousCongregationName.invalid) {
              <span class="field__error">Máximo 150 caracteres.</span>
            }
          </div>
        </div>
        <p class="text-muted text-small">
          El bautismo en agua se exige para emitir certificados de bautismo.
        </p>
      </form>

      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button
          type="submit"
          form="membership-edit-form"
          class="btn btn--primary"
          [disabled]="pending()"
        >
          {{ pending() ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class MembershipEditDialogComponent {
  private readonly repository = inject(MembersRepository);

  readonly open = model(false);
  readonly member = input.required<MemberDetail>();
  readonly saved = output<void>();

  protected readonly today = todayIso();
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    joinedOn: [''],
    baptism: ['' as BaptismChoice],
    waterBaptismOn: [''],
    baptismPlace: ['', Validators.maxLength(150)],
    previousCongregationName: ['', Validators.maxLength(150)],
  });

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      const member = this.member();
      untracked(() => {
        this.error.set(null);
        this.form.reset({
          joinedOn: member.joinedOn ?? '',
          baptism: member.isBaptized === null ? '' : member.isBaptized ? 'YES' : 'NO',
          waterBaptismOn: member.waterBaptismOn ?? '',
          baptismPlace: member.baptismPlace ?? '',
          previousCongregationName: member.previousCongregationName ?? '',
        });
      });
    });
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.repository.updateMembership(this.member().id, this.toInput()));
      this.open.set(false);
      this.saved.emit();
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  private toInput(): MembershipDataInput {
    const value = this.form.getRawValue();
    const optional = (text: string): string | null => (text.trim() === '' ? null : text.trim());
    const baptized = value.baptism === 'YES';
    return {
      joinedOn: optional(value.joinedOn),
      isBaptized: value.baptism === '' ? null : baptized,
      waterBaptismOn: baptized ? optional(value.waterBaptismOn) : null,
      baptismPlace: baptized ? optional(value.baptismPlace) : null,
      previousCongregationName: optional(value.previousCongregationName),
    };
  }
}
