/** Letters and digits that cannot be confused when read aloud or copied (no 0/O, 1/I/L). */
export const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUP_LENGTH = 4;
const GENERIC_WORDS = new Set([
  'iglesia',
  'cristiana',
  'cristiano',
  'evangelica',
  'evangelico',
  'comunidad',
  'ministerio',
  'mision',
  'centro',
  'congregacion',
]);

export const TRACKING_CODE_PATTERN = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Two-letter prefix of a denomination: the initials of its significant words, skipping
 * connectors and generic words ("Iglesia Cristiana Monte de Sion" → MS, "… Vida Nueva" → VN).
 */
export function trackingPrefix(denominationName: string): string {
  const words = denominationName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}]+/u)
    .filter((word) => /^\p{Lu}/u.test(word) && !GENERIC_WORDS.has(word.toLowerCase()));
  const initials = words.map((word) => word[0]).join('');
  const letters = (initials.length >= 2 ? initials : (words[0] ?? 'MB') + 'MB').toUpperCase();
  return letters.slice(0, 2);
}

/** e.g. MS-7F3K-92QD. `randomIndex` is injectable so tests stay deterministic. */
export function generateTrackingCode(
  denominationName: string,
  randomIndex: (size: number) => number = cryptoRandomIndex,
): string {
  const group = (): string =>
    Array.from({ length: GROUP_LENGTH }, () => TRACKING_ALPHABET[randomIndex(TRACKING_ALPHABET.length)]).join('');
  return `${trackingPrefix(denominationName)}-${group()}-${group()}`;
}

/** Uppercases and trims what the applicant typed, so "ms-7f3k-92qd " still matches. */
export function normalizeTrackingCode(value: string): string {
  return value.trim().toUpperCase();
}

function cryptoRandomIndex(size: number): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] % size;
}
