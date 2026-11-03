import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormRecord,
  NonNullableFormBuilder,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { AttendanceCount, AttendanceOptions, CatalogEntry } from './data/attendance.models';

export type AttendanceForm = FormGroup<{
  meetingTypeCode: FormControl<string>;
  sessionDate: FormControl<string>;
  congregationId: FormControl<number | null>;
  /** One control per category of the catalog; empty means 0. */
  counts: FormRecord<FormControl<number | null>>;
}>;

export type AttendanceFormValue = ReturnType<AttendanceForm['getRawValue']>;

/** Help text under each category input, by category code. */
export const CATEGORY_HINTS: Readonly<Record<string, string>> = {
  CHILDREN: 'De 0 a 11 años',
  TEENAGERS: 'De 12 a 17 años',
  WOMEN: 'Mujeres desde 18 años',
  MEN: 'Hombres desde 18 años',
  VISITORS: 'Personas no miembros',
};

/** An empty form: `configureAttendanceForm` fills it once the API options are known. */
export function buildAttendanceForm(fb: NonNullableFormBuilder): AttendanceForm {
  return fb.group({
    meetingTypeCode: fb.control('', Validators.required),
    sessionDate: fb.control('', Validators.required),
    congregationId: new FormControl<number | null>(null, Validators.required),
    counts: fb.record<FormControl<number | null>>({}),
  });
}

/**
 * Adapts the form to the options of the API: one headcount control per category, the date limited
 * to today (server date) and the first meeting type selected. Safe to call again with new options.
 */
export function configureAttendanceForm(form: AttendanceForm, options: AttendanceOptions): void {
  const { controls } = form;
  for (const category of options.categories) {
    if (!controls.counts.contains(category.code)) {
      controls.counts.addControl(category.code, headcountControl(options.maxHeadcount));
    }
  }
  controls.sessionDate.setValidators([Validators.required, notAfter(options.today)]);
  if (controls.sessionDate.value === '') {
    controls.sessionDate.setValue(options.today);
  } else {
    controls.sessionDate.updateValueAndValidity();
  }
  if (!options.meetingTypes.some((type) => type.code === controls.meetingTypeCode.value)) {
    controls.meetingTypeCode.setValue(options.meetingTypes[0]?.code ?? '');
  }
}

function headcountControl(max: number): FormControl<number | null> {
  return new FormControl<number | null>(null, [Validators.min(0), Validators.max(max), integer]);
}

/** Headcount of a valid input; empty or invalid inputs count as 0. */
export function headcountValue(value: number | null | undefined, max: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
    ? value
    : 0;
}

export function formCounts(
  value: AttendanceFormValue,
  categories: readonly CatalogEntry[],
  max: number,
): AttendanceCount[] {
  return categories.map((category) => ({
    categoryCode: category.code,
    headcount: headcountValue(value.counts[category.code], max),
  }));
}

export function formTotal(
  value: AttendanceFormValue,
  categories: readonly CatalogEntry[],
  max: number,
): number {
  return formCounts(value, categories, max).reduce((sum, count) => sum + count.headcount, 0);
}

function notAfter(today: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string;
    return value && value > today ? { futureDate: true } : null;
  };
}

function integer(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || Number.isInteger(value) ? null : { integer: true };
}
