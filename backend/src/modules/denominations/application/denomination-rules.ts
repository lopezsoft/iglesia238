import {
  ConflictDomainException,
  ForbiddenDomainException,
  InvalidInputException,
} from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  collapseSpaces,
  comparableText,
} from '../../../common/text/comparable-text.js';

export const DENOMINATION_NAME_MAX_LENGTH = 200;

/** The module belongs to the platform: a tenant context never reaches it (the guard already checks the permission). */
export function requirePlatformScope(context: TenantContext): void {
  if (context.kind !== 'PLATFORM') {
    throw new ForbiddenDomainException(
      'Esta acción solo está disponible para el equipo de plataforma.',
    );
  }
}

export function normalizeDenominationName(raw: string): string {
  const name = collapseSpaces(raw);
  if (name === '') {
    throw new InvalidInputException(
      'El nombre de la denominación es obligatorio.',
      'NAME_REQUIRED',
    );
  }
  if (name.length > DENOMINATION_NAME_MAX_LENGTH) {
    throw new InvalidInputException(
      `El nombre admite máximo ${DENOMINATION_NAME_MAX_LENGTH} caracteres.`,
      'NAME_TOO_LONG',
    );
  }
  return name;
}

/** Names are unique across the platform, ignoring case and accents. */
export function assertNameAvailable(
  name: string,
  existing: readonly { id: number; name: string }[],
  exceptId: number | null,
): void {
  const key = comparableText(name);
  const taken = existing.some(
    (row) => row.id !== exceptId && comparableText(row.name) === key,
  );
  if (taken) {
    throw new ConflictDomainException(
      'Ya existe una denominación con ese nombre.',
      'DUPLICATE_NAME',
    );
  }
}
