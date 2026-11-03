import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { GuardianGroup, showsError } from '../application-form';
import { CatalogOption, GUARDIAN_RELATIONSHIPS } from '../data/public-application.models';

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
          <label for="guardian-firstName">Nombres del acudiente *</label>
          <input id="guardian-firstName" class="input" type="text" formControlName="firstName" autocomplete="off" required
            [attr.aria-describedby]="errorId('firstName')" [attr.aria-invalid]="ariaInvalid('firstName')" />
          @if (invalid('firstName')) {
            <p id="guardian-firstName-error" class="field__error">Escribe los nombres del acudiente.</p>
          }
        </div>
        <div class="field">
          <label for="guardian-lastName">Apellidos del acudiente *</label>
          <input id="guardian-lastName" class="input" type="text" formControlName="lastName" autocomplete="off" required
            [attr.aria-describedby]="errorId('lastName')" [attr.aria-invalid]="ariaInvalid('lastName')" />
          @if (invalid('lastName')) {
            <p id="guardian-lastName-error" class="field__error">Escribe los apellidos del acudiente.</p>
          }
        </div>
        <div class="field">
          <label for="guardian-documentTypeCode">Tipo de documento *</label>
          <select id="guardian-documentTypeCode" class="select" formControlName="documentTypeCode" required>
            @for (type of documentTypes(); track type.code) {
              <option [value]="type.code">{{ type.code }} · {{ type.name }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="guardian-documentNumber">Número de documento *</label>
          <input id="guardian-documentNumber" class="input" type="text" formControlName="documentNumber" autocomplete="off"
            required [attr.aria-describedby]="describedBy('documentNumber', 'guardian-documentNumber-hint')"
            [attr.aria-invalid]="ariaInvalid('documentNumber')" />
          @if (invalid('documentNumber')) {
            <p id="guardian-documentNumber-error" class="field__error">
              Usa solo letras y números (3 a 20), sin puntos ni espacios.
            </p>
          }
          <p id="guardian-documentNumber-hint" class="field__hint">Sin puntos ni espacios.</p>
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
  readonly documentTypes = input.required<readonly CatalogOption[]>();
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
