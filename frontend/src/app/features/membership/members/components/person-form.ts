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
      documentIssuePlaceCode: [''],
      birthDate: ['', notFuture],
      birthPlaceCode: [''],
      sex: ['' as Sex | ''],
      maritalStatusCode: [''],
      educationLevelCode: [''],
      profession: ['', Validators.maxLength(120)],
      occupation: ['', Validators.maxLength(120)],
      workplace: ['', Validators.maxLength(150)],
      childrenCount: [''],
      phone: ['', Validators.pattern(/^[0-9 +()-]{7,20}$/)],
      landlinePhone: ['', Validators.pattern(/^[0-9 +()-]{7,20}$/)],
      workPhone: ['', Validators.pattern(/^[0-9 +()-]{7,20}$/)],
      email: ['', [Validators.email, Validators.maxLength(191)]],
      address: ['', Validators.maxLength(200)],
      neighborhood: ['', Validators.maxLength(100)],
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
    documentIssuePlaceCode: person.documentIssuePlaceCode ?? '',
    birthDate: person.birthDate ?? '',
    birthPlaceCode: person.birthPlaceCode ?? '',
    sex: person.sex ?? '',
    maritalStatusCode: person.maritalStatusCode ?? '',
    educationLevelCode: person.educationLevelCode ?? '',
    profession: person.profession ?? '',
    occupation: person.occupation ?? '',
    workplace: person.workplace ?? '',
    childrenCount: person.childrenCount !== null && person.childrenCount !== undefined ? String(person.childrenCount) : '',
    phone: person.phone ?? '',
    landlinePhone: person.landlinePhone ?? '',
    workPhone: person.workPhone ?? '',
    email: person.email ?? '',
    address: person.address ?? '',
    neighborhood: person.neighborhood ?? '',
    municipalityCode: person.municipalityCode ?? '',
  };
}

export function toPersonUpdate(value: PersonFormValue): PersonUpdate {
  const optional = (text: string): string | null => (text.trim() === '' ? null : text.trim());
  const parsedChildren = value.childrenCount.trim() === '' ? null : Number(value.childrenCount);
  return {
    firstName: value.firstName.trim(),
    lastName: value.lastName.trim(),
    secondLastName: optional(value.secondLastName),
    documentTypeCode: optional(value.documentTypeCode),
    documentNumber: optional(value.documentNumber),
    documentIssuePlaceCode: optional(value.documentIssuePlaceCode),
    birthDate: optional(value.birthDate),
    birthPlaceCode: optional(value.birthPlaceCode),
    sex: value.sex === '' ? null : value.sex,
    maritalStatusCode: optional(value.maritalStatusCode),
    educationLevelCode: optional(value.educationLevelCode),
    profession: optional(value.profession),
    occupation: optional(value.occupation),
    workplace: optional(value.workplace),
    childrenCount: parsedChildren !== null && Number.isFinite(parsedChildren) ? parsedChildren : null,
    phone: optional(value.phone),
    landlinePhone: optional(value.landlinePhone),
    workPhone: optional(value.workPhone),
    email: optional(value.email),
    address: optional(value.address),
    neighborhood: optional(value.neighborhood),
    municipalityCode: optional(value.municipalityCode),
  };
}
