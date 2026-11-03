import {
  AbstractControl,
  NonNullableFormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Person, Sex } from '../../../../core/models/membership.model';
import { PersonUpdate, todayIso } from '../data/members.models';

const notFuture: ValidatorFn = (control: AbstractControl<string>): ValidationErrors | null =>
  control.value && control.value > todayIso() ? { future: true } : null;

/** Document type and number go together: without the type the unique index does not protect. */
const documentPair: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const type = group.get('documentTypeCode')?.value as string;
  const number = (group.get('documentNumber')?.value as string).trim();
  return (type === '') !== (number === '') ? { documentPair: true } : null;
};

/** Reactive form of the personal data, shared by the registration and the edit dialogs. */
export function buildPersonForm(fb: NonNullableFormBuilder) {
  return fb.group(
    {
      firstName: ['', [Validators.required, Validators.maxLength(100)]],
      lastName: ['', [Validators.required, Validators.maxLength(80)]],
      secondLastName: ['', Validators.maxLength(80)],
      documentTypeCode: [''],
      documentNumber: ['', Validators.pattern(/^[A-Za-z0-9.\- ]{3,30}$/)],
      birthDate: ['', notFuture],
      sex: ['' as Sex | ''],
      maritalStatusCode: [''],
      educationLevelCode: [''],
      profession: ['', Validators.maxLength(120)],
      occupation: ['', Validators.maxLength(120)],
      phone: ['', Validators.pattern(/^[0-9 +()-]{7,20}$/)],
      email: ['', [Validators.email, Validators.maxLength(191)]],
      address: ['', Validators.maxLength(200)],
      municipalityCode: [''],
    },
    { validators: documentPair },
  );
}

export type PersonForm = ReturnType<typeof buildPersonForm>;

export type PersonFormValue = ReturnType<PersonForm['getRawValue']>;

export function personFormValue(person: Person): PersonFormValue {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    secondLastName: person.secondLastName ?? '',
    documentTypeCode: person.documentTypeCode ?? '',
    documentNumber: person.documentNumber ?? '',
    birthDate: person.birthDate ?? '',
    sex: person.sex ?? '',
    maritalStatusCode: person.maritalStatusCode ?? '',
    educationLevelCode: person.educationLevelCode ?? '',
    profession: person.profession ?? '',
    occupation: person.occupation ?? '',
    phone: person.phone ?? '',
    email: person.email ?? '',
    address: person.address ?? '',
    municipalityCode: person.municipalityCode ?? '',
  };
}

export function toPersonUpdate(value: PersonFormValue): PersonUpdate {
  const optional = (text: string): string | null => (text.trim() === '' ? null : text.trim());
  return {
    firstName: value.firstName.trim(),
    lastName: value.lastName.trim(),
    secondLastName: optional(value.secondLastName),
    documentTypeCode: optional(value.documentTypeCode),
    documentNumber: optional(value.documentNumber),
    birthDate: optional(value.birthDate),
    sex: value.sex === '' ? null : value.sex,
    maritalStatusCode: optional(value.maritalStatusCode),
    educationLevelCode: optional(value.educationLevelCode),
    profession: optional(value.profession),
    occupation: optional(value.occupation),
    phone: optional(value.phone),
    email: optional(value.email),
    address: optional(value.address),
    municipalityCode: optional(value.municipalityCode),
  };
}
