import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { GuardianGroup, showsError } from '../application-form';
import { GUARDIAN_RELATIONSHIPS } from '../data/public-application.models';

type GuardianField = keyof GuardianGroup['controls'];

/** Step 3, only for minors: the adult who answers for the applicant and authorizes the data. */
@Component({
  selector: 'app-guardian-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, IconComponent],
  styleUrl: './guardian-step.component.scss',
  template: `
    <fieldset class="step" [formGroup]="group()">
      <legend class="step__legend">Datos del acudiente</legend>
      <div class="alert alert--warning step__lead" role="note">
        <app-icon name="info" [size]="18" />
        <span>
          Como eres menor de edad, necesitamos los datos de tu acudiente. Esta persona también debe
          autorizar el tratamiento de tus datos.
        </span>
      </div>

      <div class="form-grid">
        <div class="field">
          <label for="guardian-name">Nombre completo del acudiente *</label>
          <input id="guardian-name" class="input" type="text" formControlName="name" autocomplete="off" required
            [attr.aria-describedby]="errorId('name')" [attr.aria-invalid]="ariaInvalid('name')" />
          @if (invalid('name')) {
            <p id="guardian-name-error" class="field__error">Escribe el nombre del acudiente.</p>
          }
        </div>
        <div class="field">
          <label for="guardian-document">Documento del acudiente *</label>
          <input id="guardian-document" class="input" type="text" formControlName="document" autocomplete="off"
            required [attr.aria-describedby]="describedBy('document', 'guardian-document-hint')"
            [attr.aria-invalid]="ariaInvalid('document')" />
          @if (invalid('document')) {
            <p id="guardian-document-error" class="field__error">Escribe el documento del acudiente.</p>
          }
          <p id="guardian-document-hint" class="field__hint">Tipo y número, por ejemplo CC 52345678.</p>
        </div>
        <div class="field">
          <label for="guardian-relationship">Parentesco *</label>
          <select id="guardian-relationship" class="select" formControlName="relationship" required
            [attr.aria-describedby]="errorId('relationship')" [attr.aria-invalid]="ariaInvalid('relationship')">
            <option value="" disabled>Selecciona…</option>
            @for (relationship of relationships; track relationship) {
              <option [value]="relationship">{{ relationship }}</option>
            }
          </select>
          @if (invalid('relationship')) {
            <p id="guardian-relationship-error" class="field__error">Selecciona el parentesco.</p>
          }
        </div>
        <div class="field">
          <label for="guardian-phone">Teléfono del acudiente *</label>
          <input id="guardian-phone" class="input" type="tel" formControlName="phone" autocomplete="off" required
            [attr.aria-describedby]="errorId('phone')" [attr.aria-invalid]="ariaInvalid('phone')" />
          @if (invalid('phone')) {
            <p id="guardian-phone-error" class="field__error">Escribe un teléfono válido (7 a 20 dígitos).</p>
          }
        </div>
      </div>
    </fieldset>
  `,
})
export class GuardianStepComponent {
  readonly group = input.required<GuardianGroup>();
  readonly revealErrors = input(false);

  protected readonly relationships = GUARDIAN_RELATIONSHIPS;

  protected invalid(field: GuardianField): boolean {
    return showsError(this.group().controls[field], this.revealErrors());
  }

  protected errorId(field: GuardianField): string | null {
    return this.invalid(field) ? `guardian-${field}-error` : null;
  }

  /** `aria-describedby` with the hint and, while invalid, the error message. */
  protected describedBy(field: GuardianField, hintId: string): string {
    const errorId = this.errorId(field);
    return errorId ? `${hintId} ${errorId}` : hintId;
  }

  /** `aria-invalid` only while the error is shown; null removes the attribute. */
  protected ariaInvalid(field: GuardianField): 'true' | null {
    return this.invalid(field) ? 'true' : null;
  }
}
