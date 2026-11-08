import { InvalidInputException } from '../../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../../common/mappers/value-mappers.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';

export const AI_TOOLS = Symbol('AI_TOOLS');

/**
 * A question the assistant can ask the system. Every tool is read-only and answers with figures added up (totals,
 * counts, averages): no tool returns the name, document or any other data of a person.
 */
export interface AiTool {
  /** What the model calls it. Lower case with underscores. */
  readonly name: string;
  /** Short label for people ("Resumen financiero"), shown next to the answer. */
  readonly title: string;
  /** What it answers and what the arguments mean, written for the model. */
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  /** The permission of the person (or the connection) that may ask it: the same one the screen asks for. */
  readonly permission: string;
  run(
    tenant: TenantContext,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

/** The model sends whatever it wants: arguments are checked like any other input. */
export function optionalDate(
  input: Readonly<Record<string, unknown>>,
  field: string,
): string | null {
  const value = input[field];
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !isIsoDate(value)) {
    throw new InvalidInputException(
      `«${field}» debe ser una fecha con formato AAAA-MM-DD.`,
    );
  }
  return value;
}

export function requiredDate(
  input: Readonly<Record<string, unknown>>,
  field: string,
): string {
  const value = optionalDate(input, field);
  if (value === null) {
    throw new InvalidInputException(
      `Falta «${field}» (fecha con formato AAAA-MM-DD).`,
    );
  }
  return value;
}

export function optionalPositiveInt(
  input: Readonly<Record<string, unknown>>,
  field: string,
): number | null {
  const value = input[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new InvalidInputException(
      `«${field}» debe ser un número entero positivo.`,
    );
  }
  return value;
}

export function optionalChoice<T extends string>(
  input: Readonly<Record<string, unknown>>,
  field: string,
  choices: readonly T[],
): T | null {
  const value = input[field];
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const match = choices.find((choice) => choice === value);
  if (match === undefined) {
    throw new InvalidInputException(
      `«${field}» debe ser uno de: ${choices.join(', ')}.`,
    );
  }
  return match;
}
