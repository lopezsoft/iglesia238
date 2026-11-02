import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { todayIso } from '../data/records.models';

/** ISO dates compare as strings; empty values are left to Validators.required. */
export function notFutureDate(control: AbstractControl<string | null>): ValidationErrors | null {
  return control.value && control.value > todayIso() ? { futureDate: true } : null;
}

/** Group validator: the `to` date, when present, is not before the `from` date. */
export function dateOrder(from: string, to: string): ValidatorFn {
  return (group) => {
    const start = group.get(from)?.value as string | null | undefined;
    const end = group.get(to)?.value as string | null | undefined;
    return start && end && end < start ? { dateOrder: true } : null;
  };
}

/** Shows a control error once the user touched the control or tried to submit. */
export function showError(control: AbstractControl, submitted: boolean): boolean {
  return control.invalid && (control.touched || submitted);
}
