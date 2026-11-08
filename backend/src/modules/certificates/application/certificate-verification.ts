// Pure rules of the public verification of a certificate (what an anonymous person may see).

import { daysBetween } from './certificate-document.js';

export type VerificationStatus = 'VALID' | 'EXPIRED' | 'VOIDED';

/**
 * "Ana María Rojas Díaz" -> "Ana M. R. D.": enough for the holder to recognise the document, not enough to
 * identify a person for someone who only has the link.
 */
export function maskHolderName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    return words[0] ?? '';
  }
  const [first, ...rest] = words;
  return [first, ...rest.map((word) => `${word[0].toUpperCase()}.`)].join(' ');
}

/** A voided certificate is never valid; one past its expiry date is expired (the expiry day itself still counts). */
export function verificationStatus(input: {
  readonly voidedAt: Date | null;
  readonly expiresOn: string | null;
  readonly today: string;
}): VerificationStatus {
  if (input.voidedAt !== null) {
    return 'VOIDED';
  }
  if (
    input.expiresOn !== null &&
    daysBetween(input.expiresOn, input.today) > 0
  ) {
    return 'EXPIRED';
  }
  return 'VALID';
}
