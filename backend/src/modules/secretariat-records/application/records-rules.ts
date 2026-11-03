import type {
  AuditChanges,
  AuditEntry,
} from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { PeopleDirectory } from './ports/records.ports.js';
import type { PersonSummary, TermPeriod } from './records.models.js';

/** Last day a term can end: a term without end date is open, which is later than any date. */
const OPEN_END = '9999-12-31';

export const PERSON_NOT_FOUND = 'PERSON_NOT_FOUND';
export const CONGREGATION_NOT_FOUND_MESSAGE =
  'La sede no existe o no pertenece a tu alcance.';

export function personNotFound(): NotFoundDomainException {
  return new NotFoundDomainException(
    'La persona seleccionada no existe en la denominación.',
    PERSON_NOT_FOUND,
  );
}

/** A real calendar date. `subject` completes the message: "de la presentación". */
export function assertIsoDate(
  value: string,
  message = 'Indica una fecha válida.',
): void {
  if (!isIsoDate(value)) {
    throw new BusinessRuleException(message, 'INVALID_DATE');
  }
}

/** A real date that is not in the future (Bogota). */
export function assertPastDate(
  value: string,
  subject: string,
  today: string,
): void {
  assertIsoDate(value, `Indica una fecha válida ${subject}.`);
  if (value > today) {
    throw new BusinessRuleException(
      `La fecha ${subject} no puede ser futura.`,
      'INVALID_DATE',
    );
  }
}

/** The ISO date one day before `isoDate`. */
export function previousDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1))
    .toISOString()
    .slice(0, 10);
}

/** Inclusive ranges overlap; a missing end means "still open". */
export function periodsOverlap(
  a: { startedOn: string; endedOn: string | null },
  b: { startedOn: string; endedOn: string | null },
): boolean {
  return (
    a.startedOn <= (b.endedOn ?? OPEN_END) &&
    b.startedOn <= (a.endedOn ?? OPEN_END)
  );
}

export function openPeriod(periods: readonly TermPeriod[]): TermPeriod | null {
  return periods.find((period) => period.endedOn === null) ?? null;
}

/** Loads the people or answers 404 for the first one that does not exist in the denomination. */
export async function requirePeople(
  directory: PeopleDirectory,
  scope: TenantScope,
  ids: readonly number[],
): Promise<Map<number, PersonSummary>> {
  const unique = [...new Set(ids)];
  const found = await directory.findByIds(scope, unique);
  const byId = new Map(found.map((person) => [person.id, person]));
  if (unique.some((id) => !byId.has(id))) {
    throw personNotFound();
  }
  return byId;
}

export interface RecordsAuditInput {
  readonly entity: string;
  readonly entityId: number;
  readonly action: string;
  readonly congregationId?: number | null;
  readonly changes?: AuditChanges;
}

/** Audit entry of a records change. Changes never carry names or documents. */
export function recordsAuditEntry(
  tenant: TenantContext,
  input: RecordsAuditInput,
): AuditEntry {
  return {
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    actor: tenant,
    ...(input.congregationId === undefined
      ? {}
      : { congregationId: input.congregationId }),
    ...(input.changes === undefined ? {} : { changes: input.changes }),
  };
}
