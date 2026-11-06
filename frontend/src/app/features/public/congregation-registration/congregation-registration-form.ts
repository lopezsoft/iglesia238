import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { PHONE_PATTERN } from '../application/application-form';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordsMatch } from '../../auth/password-form';
import { REGISTRATION_LIMITS } from './data/congregation-registration.models';

/** Form of the public congregation registration: legal entity, the congregation and its manager. */
export function createRegistrationForm(fb: NonNullableFormBuilder) {
  return fb.group({
    legalEntityId: fb.control<number | null>(null, Validators.required),
    congregation: fb.group({
      name: ['', [Validators.required, Validators.maxLength(REGISTRATION_LIMITS.congregationName)]],
      regionCode: [''],
      municipalityCode: ['', Validators.required],
      // Label of the municipality picked, only for display.
      municipalityName: [''],
      address: ['', [Validators.required, Validators.maxLength(REGISTRATION_LIMITS.address)]],
      phone: ['', [Validators.pattern(PHONE_PATTERN), Validators.maxLength(REGISTRATION_LIMITS.phone)]],
      email: ['', [Validators.email, Validators.maxLength(REGISTRATION_LIMITS.email)]],
    }),
    manager: fb.group(
      {
        displayName: ['', [Validators.required, Validators.maxLength(REGISTRATION_LIMITS.displayName)]],
        email: ['', [Validators.required, Validators.email, Validators.maxLength(REGISTRATION_LIMITS.email)]],
        password: [
          '',
          [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH), Validators.maxLength(MAX_PASSWORD_LENGTH)],
        ],
        confirm: ['', [Validators.required]],
      },
      { validators: passwordsMatch('password', 'confirm') },
    ),
  });
}

export type RegistrationForm = ReturnType<typeof createRegistrationForm>;
