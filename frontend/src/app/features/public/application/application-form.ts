import { Signal, effect, untracked } from '@angular/core';
import { AbstractControl, FormControl, NonNullableFormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { Sex } from '../../../core/models/membership.model';
import { todayIso } from './data/public-application.models';

export const DOCUMENT_NUMBER_PATTERN = /^[A-Za-z0-9]{3,20}$/;
export const PHONE_PATTERN = /^[0-9+\s-]{7,20}$/;

/** Why a birth date is not plausible: in the future, or an age above 120 years. */
export type BirthDateProblem = 'future' | 'tooOld';

/** Rejects future dates and ages above 120 years (`{ birthDate: 'future' | 'tooOld' }`). */
export function plausibleBirthDate(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value;
  if (!value) {
    return null;
  }
  const today = todayIso();
  const oldest = `${Number(today.slice(0, 4)) - 120}${today.slice(4)}`;
  if (value > today) {
    return { birthDate: 'future' satisfies BirthDateProblem };
  }
  return value < oldest ? { birthDate: 'tooOld' satisfies BirthDateProblem } : null;
}

/**
 * C-01 / Ley 1581: the tick is consent to the policy that was shown. When another policy is
 * loaded (e.g. the applicant picks a sede of another denomination) the tick is cleared, so the
 * applicant must read and accept the new one. Call it in an injection context.
 */
export function resetConsentWhenPolicyChanges(
  accepted: FormControl<boolean>,
  policyId: Signal<number | undefined>,
): void {
  let shownPolicyId: number | undefined;
  effect(() => {
    const id = policyId();
    if (id === undefined || id === shownPolicyId) {
      return;
    }
    if (shownPolicyId !== undefined) {
      untracked(() => accepted.reset(false));
    }
    shownPolicyId = id;
  });
}

/** Typed reactive form of the four steps; each child step receives its own group. */
export function createApplicationForm(fb: NonNullableFormBuilder) {
  return fb.group({
    congregationId: fb.control<number | null>(null, Validators.required),
    personal: fb.group({
      firstName: ['', [Validators.required, Validators.maxLength(80)]],
      lastName: ['', [Validators.required, Validators.maxLength(80)]],
      secondLastName: ['', Validators.maxLength(80)],
      documentTypeCode: ['CC', Validators.required],
      documentNumber: ['', [Validators.required, Validators.pattern(DOCUMENT_NUMBER_PATTERN)]],
      birthDate: ['', [Validators.required, plausibleBirthDate]],
      sex: fb.control<Sex | ''>('', Validators.required),
      maritalStatusCode: ['', Validators.required],
      phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      email: ['', [Validators.email, Validators.maxLength(254)]],
      address: ['', [Validators.required, Validators.maxLength(120)]],
      municipalityCode: ['', Validators.required],
    }),
    guardian: fb.group({
      name: ['', [Validators.required, Validators.maxLength(120)]],
      document: ['', [Validators.required, Validators.maxLength(30)]],
      relationship: ['', Validators.required],
      phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
    }),
    consent: fb.group({
      accepted: [false, Validators.requiredTrue],
      /** Honeypot: hidden from people, filled by bots. */
      website: [''],
    }),
  });
}

export type ApplicationForm = ReturnType<typeof createApplicationForm>;
export type PersonalDataGroup = ApplicationForm['controls']['personal'];
export type GuardianGroup = ApplicationForm['controls']['guardian'];
export type ConsentGroup = ApplicationForm['controls']['consent'];

/** True when the control should show its error: touched, or the step was submitted. */
export function showsError(control: AbstractControl, revealed: boolean): boolean {
  return control.invalid && (control.touched || revealed);
}
