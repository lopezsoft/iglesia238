/** Shape of the code the API hands out once (e.g. IG-7F3K-92QD). */
export const TRACKING_CODE_PATTERN = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/** What the form shows as an example; the real code comes from the API. */
export const TRACKING_CODE_EXAMPLE = 'IG-7F3K-92QD';

/** Uppercases and trims what the applicant typed, so "ig-7f3k-92qd " still matches. */
export function normalizeTrackingCode(value: string): string {
  return value.trim().toUpperCase();
}
