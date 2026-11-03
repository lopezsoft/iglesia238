import { BusinessRuleException } from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import {
  type AttendanceCountRecord,
  type CatalogEntry,
  MAX_HEADCOUNT,
  sessionTotal,
} from './attendance.models.js';

/** The date must be a real calendar day and not later than today (Bogota). */
export function assertSessionDate(sessionDate: string, today: string): void {
  if (!isIsoDate(sessionDate)) {
    throw new BusinessRuleException(
      'Selecciona una fecha válida.',
      'INVALID_DATE',
    );
  }
  if (sessionDate > today) {
    throw new BusinessRuleException(
      'No puedes registrar asistencia en una fecha futura.',
      'INVALID_DATE',
    );
  }
}

export function assertMeetingType(
  code: string,
  meetingTypes: readonly CatalogEntry[],
): CatalogEntry {
  const found = meetingTypes.find((type) => type.code === code);
  if (!found) {
    throw new BusinessRuleException(
      'Selecciona un tipo de reunión válido.',
      'INVALID_MEETING_TYPE',
    );
  }
  return found;
}

/**
 * One count per category of the catalog (missing ones are 0), each an integer between 0 and
 * MAX_HEADCOUNT, and at least one attendee. Unknown or repeated categories are rejected.
 */
export function normalizeCounts(
  input: readonly AttendanceCountRecord[],
  categories: readonly CatalogEntry[],
): AttendanceCountRecord[] {
  const known = new Set(categories.map((category) => category.code));
  const seen = new Set<string>();
  for (const count of input) {
    if (!known.has(count.categoryCode) || seen.has(count.categoryCode)) {
      throw new BusinessRuleException(
        'Las categorías de asistencia no son válidas.',
        'INVALID_CATEGORY',
      );
    }
    seen.add(count.categoryCode);
  }

  const normalized = categories.map((category) => {
    const headcount =
      input.find((count) => count.categoryCode === category.code)?.headcount ??
      0;
    if (
      !Number.isInteger(headcount) ||
      headcount < 0 ||
      headcount > MAX_HEADCOUNT
    ) {
      throw new BusinessRuleException(
        `Cada categoría admite un número entero entre 0 y ${MAX_HEADCOUNT}.`,
        'INVALID_HEADCOUNT',
      );
    }
    return { categoryCode: category.code, headcount };
  });

  if (sessionTotal(normalized) === 0) {
    throw new BusinessRuleException(
      'Ingresa al menos un asistente.',
      'EMPTY_SESSION',
    );
  }
  return normalized;
}
