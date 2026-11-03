import {
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type { AuditActor } from '../../../common/audit/audit-recorder.port.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import {
  collapseSpaces,
  comparableText,
} from '../../../common/text/comparable-text.js';

/** Max lengths of the columns. */
export const FIELD_LIMITS = {
  congregationName: 150,
  congregationCode: 10,
  legalName: 200,
  taxId: 30,
  districtNumber: 20,
  districtName: 150,
  address: 200,
  phone: 30,
  email: 191,
  neighborhood: 120,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const COUNTRY_NOT_FOUND = 'COUNTRY_NOT_FOUND';
export const MUNICIPALITY_COUNTRY_MISMATCH = 'MUNICIPALITY_COUNTRY_MISMATCH';

export function countryNotFound(): NotFoundDomainException {
  return new NotFoundDomainException('El país no existe.', COUNTRY_NOT_FOUND);
}

export function countryInactive(): ConflictDomainException {
  return new ConflictDomainException(
    'El país no está activo en el sistema.',
    'COUNTRY_INACTIVE',
  );
}

/**
 * The municipality is looked up inside the country of the legal entity, so a code that is not found
 * there is not a municipality of that country, whatever it may be elsewhere.
 */
export function municipalityCountryMismatch(): InvalidInputException {
  return new InvalidInputException(
    'El municipio no pertenece al país de la razón social.',
    MUNICIPALITY_COUNTRY_MISMATCH,
  );
}

/**
 * NIT: base digits (plain or grouped by thousands with dots) plus the check digit,
 * e.g. 900.123.456-7 or 900123456-7.
 */
export const TAX_ID_PATTERN = /^(?:\d{1,3}(?:\.\d{3}){1,3}|\d{5,12})-\d$/;

/**
 * Organization changes belong to the whole denomination even when the administrator is looking at a
 * sede, so the scope never carries the congregation of the session.
 */
export function denominationScopeOf(context: TenantContext): TenantScope {
  return TenantScope.of(context.tenantScope().denominationId);
}

/** Who acts in the audit log, at denomination level. */
export function denominationAuditActor(context: TenantContext): AuditActor {
  return {
    userId: context.userId,
    denominationId: context.tenantScope().denominationId,
    congregationId: null,
  };
}

export function requiredText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
  code = 'REQUIRED',
): string {
  const text = collapseSpaces(value ?? '');
  if (text === '') {
    throw new InvalidInputException(`${label} es obligatorio.`, code);
  }
  assertMaxLength(text, maxLength, label);
  return text;
}

export function optionalText(
  value: string | null | undefined,
  label: string,
  maxLength: number,
): string | null {
  const text = collapseSpaces(value ?? '');
  if (text === '') {
    return null;
  }
  assertMaxLength(text, maxLength, label);
  return text;
}

function assertMaxLength(text: string, maxLength: number, label: string): void {
  if (text.length > maxLength) {
    throw new InvalidInputException(
      `${label} admite máximo ${maxLength} caracteres.`,
      'TOO_LONG',
    );
  }
}

export function optionalEmail(value: string | null | undefined): string | null {
  const email = optionalText(value, 'El correo', FIELD_LIMITS.email);
  if (email === null) {
    return null;
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new InvalidInputException(
      'El correo no tiene un formato válido.',
      'INVALID_EMAIL',
    );
  }
  return email.toLowerCase();
}

/** Digits of a NIT, used to compare NITs written with or without dots. */
export function taxIdDigits(taxId: string): string {
  return taxId.replace(/\D/g, '');
}

/** Canonical NIT: base grouped by thousands with dots, a hyphen and the check digit. */
export function formatTaxId(taxId: string): string {
  const [base = '', checkDigit = ''] = taxId.trim().split('-');
  const digits = base.replace(/\D/g, '');
  return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${checkDigit}`;
}

/** Validates the NIT and returns it in canonical form, so 900123456-7 and 900.123.456-7 are one NIT. */
export function canonicalTaxId(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!TAX_ID_PATTERN.test(raw) || raw.length > FIELD_LIMITS.taxId) {
    throw new InvalidInputException(
      'El NIT debe tener el formato 900.123.456-7, con dígito de verificación.',
      'INVALID_TAX_ID',
    );
  }
  return formatTaxId(raw);
}

export function districtLabel(district: {
  number: string;
  name: string | null;
}): string {
  return district.name
    ? `${district.number} · ${district.name}`
    : `Distrito ${district.number}`;
}

export function sameText(left: string, right: string): boolean {
  return comparableText(left) === comparableText(right);
}

// Words that say nothing about which sede it is.
const CODE_FILLER = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'y',
  'iglesia',
  'sede',
  'congregacion',
]);
const CODE_MIN_LENGTH = 2;
const CODE_BASE_MAX_LENGTH = 6;

/** Letters and digits of a code, in upper case and without accents. */
export function normalizeCode(value: string): string {
  return comparableText(value)
    .replace(/[^a-z0-9]/g, '')
    .toUpperCase();
}

/**
 * Stable abbreviation of a sede ("Monte de Sión Cartagena" gives MSC). It does not change when the
 * sede is renamed. If it is taken, a number is appended: MSC2, MSC3...
 */
export function generateCongregationCode(
  name: string,
  taken: ReadonlySet<string>,
): string {
  const words = comparableText(name)
    .split(' ')
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word !== '');
  const meaningful = words.filter((word) => !CODE_FILLER.has(word));
  const source = meaningful.length > 0 ? meaningful : words;

  let base =
    source.length > 1
      ? source.map((word) => word.charAt(0)).join('')
      : (source[0] ?? 'S').slice(0, 3);
  base = base.toUpperCase().slice(0, CODE_BASE_MAX_LENGTH);
  while (base.length < CODE_MIN_LENGTH) {
    base += 'X';
  }

  const used = new Set([...taken].map((code) => code.toUpperCase()));
  if (!used.has(base)) {
    return base;
  }
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base.slice(0, FIELD_LIMITS.congregationCode - String(suffix).length)}${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}
