import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** The API enforces the real policy; this only saves a round trip for the obvious cases. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

export const PASSWORD_HINT = `Usa al menos ${MIN_PASSWORD_LENGTH} caracteres; mezcla letras, números y símbolos.`;

/** Group validator: `confirm` must equal `password`. Sets the error on the group as `mismatch`. */
export function passwordsMatch(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;
    return password && confirm && password !== confirm ? { mismatch: true } : null;
  };
}

/** Spanish message for the first failing rule of a new-password control, or null while it is fine. */
export function newPasswordError(control: AbstractControl): string | null {
  if (!control.touched || control.valid) {
    return null;
  }
  if (control.hasError('required')) {
    return 'Escribe la nueva contraseña.';
  }
  if (control.hasError('minlength')) {
    return `Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return 'La contraseña no es válida.';
}
