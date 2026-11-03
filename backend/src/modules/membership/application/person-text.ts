import { formatMemberCode } from '../../../common/numbering/document-numbering.service.js';

export { formatMemberCode };

const DOCUMENT_SEPARATORS = /[.\s-]/g;
const MASK = '····';

/** Document as it is stored and compared: no dots, spaces or hyphens, upper case. */
export function normalizeDocument(value: string): string {
  return value.replace(DOCUMENT_SEPARATORS, '').toUpperCase();
}

/** "CC ···· 4817": enough to recognize a person, never the full number. */
export function maskDocument(
  typeCode: string | null,
  documentNumber: string | null,
): string | null {
  if (!documentNumber) {
    return null;
  }
  return [typeCode, MASK, documentNumber.slice(-4)].filter(Boolean).join(' ');
}

interface NameParts {
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly secondLastName: string | null;
  readonly fullName: string | null;
}

/** Names of a person; relatives that only have `fullName` use it. */
export function displayName(person: NameParts): string {
  const composed = [person.firstName, person.lastName, person.secondLastName]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  return composed || person.fullName || 'Sin nombre';
}

/** Splits a search text into words; empty words are dropped. */
export function searchTerms(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((term) => term !== '');
}

/** "SC-0130" -> { code: 'SC', number: 130 }; null when the text is not a member code. */
export function parseMemberCode(
  text: string,
): { code: string; number: number } | null {
  const match = /^([A-Za-z0-9]{1,10})-(\d{1,8})$/.exec(text.trim());
  return match
    ? { code: match[1].toUpperCase(), number: Number(match[2]) }
    : null;
}
