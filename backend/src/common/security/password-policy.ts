import { InvalidInputException } from '../errors/domain.exception.js';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
export const WEAK_PASSWORD_CODE = 'WEAK_PASSWORD';

/**
 * Returns the reason a password is not acceptable (in Spanish, ready to show), or null when it is.
 * `personalValues` are things the password must not contain, such as the email of the user.
 */
export function findPasswordProblem(
  password: string,
  personalValues: readonly string[] = [],
): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `La contraseña no puede superar ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
    return 'La contraseña debe combinar letras y números.';
  }
  if (new Set(password).size < 4) {
    return 'La contraseña es demasiado repetitiva.';
  }

  const lowered = password.toLowerCase();
  const containsPersonalValue = personalValues
    .map((value) => value.trim().toLowerCase())
    .some((value) => value.length >= 4 && lowered.includes(value));
  return containsPersonalValue
    ? 'La contraseña no puede contener tu correo ni tu nombre.'
    : null;
}

export function assertStrongPassword(
  password: string,
  personalValues: readonly string[] = [],
): void {
  const problem = findPasswordProblem(password, personalValues);
  if (problem) {
    throw new InvalidInputException(problem, WEAK_PASSWORD_CODE);
  }
}
