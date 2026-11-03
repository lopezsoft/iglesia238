import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * ISO dates compare as strings; empty values are left to Validators.required. `today` is the server
 * date; an empty one (not loaded yet) limits nothing.
 */
export function notAfterToday(today: string): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as string | null;
    return value && today && value > today ? { futureDate: true } : null;
  };
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
