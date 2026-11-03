/** Age from which a person answers for themselves (Colombian majority). */
export const ADULT_AGE = 18;

/** Older than this is almost surely a typing mistake in the birth date. */
export const MAX_PLAUSIBLE_AGE = 120;

/**
 * Age in whole years on `today`. Both arguments are calendar days written YYYY-MM-DD, so the result
 * does not depend on the time zone of the server.
 */
export function ageOn(birthDate: string, today: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [year, month, day] = today.split('-').map(Number);
  const hadBirthday =
    month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (hadBirthday ? 0 : 1);
}

export function isMinorOn(birthDate: string | null, today: string): boolean {
  return birthDate !== null && ageOn(birthDate, today) < ADULT_AGE;
}
