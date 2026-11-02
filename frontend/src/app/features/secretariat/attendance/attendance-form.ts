import {
  AbstractControl,
  FormControl,
  FormGroup,
  FormRecord,
  NonNullableFormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ATTENDANCE_CATEGORIES, MEETING_TYPES } from '../../../core/models/catalogs';
import { AttendanceCount, MAX_HEADCOUNT, todayIso } from './data/attendance.models';

export type AttendanceForm = FormGroup<{
  meetingTypeCode: FormControl<string>;
  sessionDate: FormControl<string>;
  congregationId: FormControl<number | null>;
  /** One control per ATTENDANCE_CATEGORIES code; empty means 0. */
  counts: FormRecord<FormControl<number | null>>;
}>;

export type AttendanceFormValue = ReturnType<AttendanceForm['getRawValue']>;

/** Help text under each category input. */
export const CATEGORY_HINTS: Readonly<Record<string, string>> = {
  CHILDREN: 'De 0 a 11 años',
  TEENAGERS: 'De 12 a 17 años',
  WOMEN: 'Mujeres desde 18 años',
  MEN: 'Hombres desde 18 años',
  VISITORS: 'Personas no miembros',
};

export function buildAttendanceForm(fb: NonNullableFormBuilder): AttendanceForm {
  const counts = fb.record<FormControl<number | null>>({});
  for (const category of ATTENDANCE_CATEGORIES) {
    counts.addControl(category.code, headcountControl());
  }
  return fb.group({
    meetingTypeCode: fb.control(MEETING_TYPES[0].code, Validators.required),
    sessionDate: fb.control(todayIso(), [Validators.required, notFutureDate]),
    congregationId: new FormControl<number | null>(null, Validators.required),
    counts,
  });
}

function headcountControl(): FormControl<number | null> {
  return new FormControl<number | null>(null, [
    Validators.min(0),
    Validators.max(MAX_HEADCOUNT),
    integer,
  ]);
}

/** Headcount of a valid input; empty or invalid inputs count as 0. */
export function headcountValue(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_HEADCOUNT
    ? value
    : 0;
}

export function formCounts(value: AttendanceFormValue): AttendanceCount[] {
  return ATTENDANCE_CATEGORIES.map((category) => ({
    categoryCode: category.code,
    headcount: headcountValue(value.counts[category.code]),
  }));
}

export function formTotal(value: AttendanceFormValue): number {
  return formCounts(value).reduce((sum, count) => sum + count.headcount, 0);
}

function notFutureDate(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value;
  if (!value) {
    return null;
  }
  return value > todayIso() ? { futureDate: true } : null;
}

function integer(control: AbstractControl<number | null>): ValidationErrors | null {
  const value = control.value;
  return value === null || Number.isInteger(value) ? null : { integer: true };
}
