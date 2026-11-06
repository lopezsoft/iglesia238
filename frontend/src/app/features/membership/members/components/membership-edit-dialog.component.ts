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
            <label for="membership-converted-on">Fecha de conversión</label>
            <input
              id="membership-converted-on"
              class="input"
              type="date"
              formControlName="convertedOn"
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
              <label for="membership-baptism-place">Congregación o lugar del bautismo</label>
              <input id="membership-baptism-place" class="input" formControlName="baptismPlace" />
              @if (form.controls.baptismPlace.invalid) {
                <span class="field__error">Máximo 150 caracteres.</span>
              }
            </div>
            <div class="field">
              <label for="membership-baptizing-pastor">Pastor que bautizó</label>
              <input
                id="membership-baptizing-pastor"
                class="input"
                formControlName="baptizingPastorName"
              />
            </div>
          }
          <div class="field">
            <label for="membership-holy-spirit">Bautismo del Espíritu Santo</label>
            <input
              id="membership-holy-spirit"
              class="input"
              type="date"
              formControlName="holySpiritBaptismOn"
              [max]="today"
            />
          </div>
          <div class="field">
            <label for="membership-reconciled-on">Fecha de reconciliación</label>
            <input
              id="membership-reconciled-on"
              class="input"
              type="date"
              formControlName="reconciledOn"
              [max]="today"
            />
          </div>
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
          <div class="field">
            <label for="membership-teacher">Maestro(a) de Educación Cristiana</label>
            <select id="membership-teacher" class="select" formControlName="teacher">
              <option value="">Sin dato</option>
              <option value="YES">Sí</option>
              <option value="NO">No</option>
            </select>
          </div>
          <div class="field field--full">
            <label for="membership-desired-areas">Áreas de servicio en las que desea servir</label>
            <input
              id="membership-desired-areas"
              class="input"
              formControlName="desiredAreas"
            />
          </div>
          <div class="field field--full">
            <label for="membership-pastor-notes">Observaciones del pastor</label>
            <input
              id="membership-pastor-notes"
              class="input"
              formControlName="pastorNotes"
            />
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
    convertedOn: [''],
    baptism: ['' as BaptismChoice],
    waterBaptismOn: [''],
    baptismPlace: ['', Validators.maxLength(150)],
    baptizingPastorName: ['', Validators.maxLength(150)],
    holySpiritBaptismOn: [''],
    reconciledOn: [''],
    previousCongregationName: ['', Validators.maxLength(150)],
    teacher: ['' as BaptismChoice],
    desiredAreas: ['', Validators.maxLength(500)],
    pastorNotes: ['', Validators.maxLength(1000)],
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
          convertedOn: member.convertedOn ?? '',
          baptism: member.isBaptized === null ? '' : member.isBaptized ? 'YES' : 'NO',
          waterBaptismOn: member.waterBaptismOn ?? '',
          baptismPlace: member.baptismPlace ?? '',
          baptizingPastorName: member.baptizingPastorName ?? '',
          holySpiritBaptismOn: member.holySpiritBaptismOn ?? '',
          reconciledOn: member.reconciledOn ?? '',
          previousCongregationName: member.previousCongregationName ?? '',
          teacher:
            member.isChristianEducationTeacher === null ||
            member.isChristianEducationTeacher === undefined
              ? ''
              : member.isChristianEducationTeacher
                ? 'YES'
                : 'NO',
          desiredAreas: member.desiredAreas ?? '',
          pastorNotes: member.pastorNotes ?? '',
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
      convertedOn: optional(value.convertedOn),
      isBaptized: value.baptism === '' ? null : baptized,
      waterBaptismOn: baptized ? optional(value.waterBaptismOn) : null,
      baptismPlace: baptized ? optional(value.baptismPlace) : null,
      baptizingPastorName: baptized ? optional(value.baptizingPastorName) : null,
      holySpiritBaptismOn: optional(value.holySpiritBaptismOn),
      reconciledOn: optional(value.reconciledOn),
      previousCongregationName: optional(value.previousCongregationName),
      isChristianEducationTeacher: value.teacher === '' ? null : value.teacher === 'YES',
      desiredAreas: optional(value.desiredAreas),
      pastorNotes: optional(value.pastorNotes),
    };
  }
}
