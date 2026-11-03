import { MAX_MONEY_AMOUNT, roundMoney } from './accounting-rules.js';
import { InvalidInputException } from '../errors/domain.exception.js';
import { isIsoDate } from '../mappers/value-mappers.js';

export const MIN_REASON_LENGTH = 10;
export const MAX_REASON_LENGTH = 255;
export const MAX_REFERENCE_LENGTH = 80;
export const MAX_NOTES_LENGTH = 255;

/** Payment methods that leave a trace at the bank, so the reference of the transaction is required. */
export const METHODS_WITH_REFERENCE: readonly string[] = [
  'BANK_TRANSFER',
  'CARD',
  'BANK_DEPOSIT',
];

export const ValidationCode = {
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  INVALID_DATE: 'INVALID_DATE',
  FUTURE_DATE: 'FUTURE_DATE',
  REFERENCE_REQUIRED: 'REFERENCE_REQUIRED',
  REFERENCE_TOO_LONG: 'REFERENCE_TOO_LONG',
  NOTES_TOO_LONG: 'NOTES_TOO_LONG',
  VOID_REASON_REQUIRED: 'VOID_REASON_REQUIRED',
} as const;

/** The amount rounded to cents, or 400 INVALID_AMOUNT when it is not a positive amount that fits the column. */
export function validAmount(value: number, label = 'del aporte'): number {
  const amount = roundMoney(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MONEY_AMOUNT) {
    throw new InvalidInputException(
      `El valor ${label} debe ser mayor que cero.`,
      ValidationCode.INVALID_AMOUNT,
    );
  }
  return amount;
}

/** A real calendar date that is not after today. */
export function validPastOrTodayDate(
  value: string,
  today: string,
  label: string,
): string {
  if (!isIsoDate(value)) {
    throw new InvalidInputException(
      `La fecha ${label} no es válida.`,
      ValidationCode.INVALID_DATE,
    );
  }
  if (value > today) {
    throw new InvalidInputException(
      `La fecha ${label} no puede ser posterior a hoy.`,
      ValidationCode.FUTURE_DATE,
    );
  }
  return value;
}

/** Trimmed reason of 10 to 255 characters (the audit trail needs a real explanation). */
export function validReason(value: string, what: string): string {
  const reason = value.trim().replace(/\s+/g, ' ');
  if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
    throw new InvalidInputException(
      `Describe el motivo de ${what} (de ${MIN_REASON_LENGTH} a ${MAX_REASON_LENGTH} caracteres).`,
      ValidationCode.VOID_REASON_REQUIRED,
    );
  }
  return reason;
}

/** Bank methods need the reference of the transaction; cash does not. */
export function validReference(
  method: string,
  reference: string | null | undefined,
): string | null {
  const clean = reference?.trim() || null;
  if (METHODS_WITH_REFERENCE.includes(method) && clean === null) {
    throw new InvalidInputException(
      'La referencia es obligatoria para transferencia, datáfono y consignación.',
      ValidationCode.REFERENCE_REQUIRED,
    );
  }
  if (clean !== null && clean.length > MAX_REFERENCE_LENGTH) {
    throw new InvalidInputException(
      `La referencia admite máximo ${MAX_REFERENCE_LENGTH} caracteres.`,
      ValidationCode.REFERENCE_TOO_LONG,
    );
  }
  return clean;
}

export function validNotes(
  value: string | null | undefined,
  label = 'La descripción',
): string | null {
  const clean = value?.trim() || null;
  if (clean !== null && clean.length > MAX_NOTES_LENGTH) {
    throw new InvalidInputException(
      `${label} admite máximo ${MAX_NOTES_LENGTH} caracteres.`,
      ValidationCode.NOTES_TOO_LONG,
    );
  }
  return clean;
}
