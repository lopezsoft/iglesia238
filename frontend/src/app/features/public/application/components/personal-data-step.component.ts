import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import {
  DEMO_MUNICIPALITIES,
  DOCUMENT_TYPES,
  MARITAL_STATUSES,
  municipalityLabel,
} from '../../../../core/models/catalogs';
import { ADULT_AGE, SEX_OPTIONS } from '../data/public-application.models';
import { PersonalDataGroup, showsError } from '../application-form';

type PersonalField = keyof PersonalDataGroup['controls'];

/** Step 2: identification and contact of the applicant. */
@Component({
  selector: 'app-personal-data-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  styleUrl: './personal-data-step.component.scss',
  templateUrl: './personal-data-step.component.html',
})
export class PersonalDataStepComponent {
  readonly group = input.required<PersonalDataGroup>();
  readonly revealErrors = input(false);
  /** Age computed from the birth date, null while it is empty or invalid. */
  readonly age = input<number | null>(null);

  protected readonly documentTypes = DOCUMENT_TYPES;
  protected readonly maritalStatuses = MARITAL_STATUSES;
  protected readonly sexOptions = SEX_OPTIONS;
  protected readonly municipalities = DEMO_MUNICIPALITIES.map((municipality) => ({
    code: municipality.code,
    label: municipalityLabel(municipality.code),
  }));
  protected readonly isMinor = computed(() => {
    const age = this.age();
    return age !== null && age < ADULT_AGE;
  });

  protected invalid(field: PersonalField): boolean {
    return showsError(this.group().controls[field], this.revealErrors());
  }

  protected errorId(field: PersonalField): string | null {
    return this.invalid(field) ? `${field}-error` : null;
  }

  /** `aria-describedby` with the hint and, while invalid, the error message. */
  protected describedBy(field: PersonalField, hintId: string): string {
    const errorId = this.errorId(field);
    return errorId ? `${hintId} ${errorId}` : hintId;
  }

  /** `aria-invalid` only while the error is shown; null removes the attribute. */
  protected ariaInvalid(field: PersonalField): 'true' | null {
    return this.invalid(field) ? 'true' : null;
  }

  protected birthDateMessage(): string {
    const errors = this.group().controls.birthDate.errors;
    if (errors?.['required']) {
      return 'Escribe tu fecha de nacimiento.';
    }
    return errors?.['birthDate'] === 'tooOld'
      ? 'Revisa la fecha: la edad no puede superar 120 años.'
      : 'Revisa la fecha: no puede ser futura.';
  }
}
