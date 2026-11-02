/**
 * Business rule rejected by the data source. `message` is safe to show to the user (Spanish)
 * and never contains personal data; `code` lets the UI react to a specific rule.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const GENERIC_ERROR_MESSAGE = 'No fue posible completar la operación. Intenta de nuevo.';

export function userMessage(error: unknown): string {
  return error instanceof DomainError ? error.message : GENERIC_ERROR_MESSAGE;
}
