import { createHash, randomInt } from 'node:crypto';

/** Letters and digits that cannot be confused when read aloud or copied (no 0/O, 1/I/L). */
export const TRACKING_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUP_LENGTH = 4;
/** Fixed prefix: only the hash is stored and it is unique on its own, so it needs no tenant meaning. */
const PREFIX = 'IG';

export const TRACKING_CODE_PATTERN = /^[A-Z]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function group(): string {
  return Array.from(
    { length: GROUP_LENGTH },
    () => TRACKING_ALPHABET[randomInt(TRACKING_ALPHABET.length)],
  ).join('');
}

/** IG-7F3K-92QD. 31^8 combinations from a CSPRNG: unguessable, and the status route is throttled. */
export function generateTrackingCode(): string {
  return `${PREFIX}-${group()}-${group()}`;
}

/** What the applicant typed, uppercased and trimmed, so "ig-7f3k-92qd " still matches. */
export function normalizeTrackingCode(value: string): string {
  return value.trim().toUpperCase();
}

/** The database keeps only this digest; the code itself is shown once, in the submit response. */
export function hashTrackingCode(code: string): string {
  return createHash('sha256').update(normalizeTrackingCode(code)).digest('hex');
}
