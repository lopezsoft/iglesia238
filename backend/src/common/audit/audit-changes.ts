import { isSensitiveKey } from '../logging/sensitive-data-redactor.js';
import { AuditChanges } from './audit-recorder.port.js';

const MAX_TEXT_LENGTH = 200;

type Comparable =
  string | number | boolean | null | undefined | Date | { toNumber(): number };

/** Keeps the audit trail free of personal data: a programming error, found by the first test that runs. */
export class SensitiveAuditFieldError extends Error {
  constructor(field: string) {
    super(`Field "${field}" can hold personal data and cannot be audited`);
  }
}

function normalize(value: Comparable): string | number | boolean | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return value.toNumber();
  }
  if (typeof value === 'string') {
    return value.length > MAX_TEXT_LENGTH
      ? `${value.slice(0, MAX_TEXT_LENGTH)}…`
      : value;
  }
  return value;
}

/**
 * Differences between two states as `{ field: { from, to } }`, only for the listed fields.
 * Pass `before = null` for a creation: every non-empty field is reported with `from: null`.
 * Fields whose name suggests personal data or credentials are refused.
 */
export function buildAuditChanges(
  before: Readonly<Record<string, Comparable>> | null,
  after: Readonly<Record<string, Comparable>>,
  fields: readonly string[],
): AuditChanges {
  const changes: AuditChanges = {};
  for (const field of fields) {
    if (isSensitiveKey(field)) {
      throw new SensitiveAuditFieldError(field);
    }
    const from = normalize(before?.[field]);
    const to = normalize(after[field]);
    if (from !== to) {
      changes[field] = { from, to };
    }
  }
  return changes;
}
