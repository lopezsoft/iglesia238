/**
 * Business rule rejected by the data source. `message` is safe to show to the user (Spanish)
 * and never contains personal data; `code` lets the UI react to a specific rule.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** HTTP status when the error comes from the API. */
    readonly status?: number,
    /** Seconds to wait before retrying (429 and locked accounts), when the API says so. */
    readonly retryAfterSeconds?: number | null,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const GENERIC_ERROR_MESSAGE = 'No fue posible completar la operación. Intenta de nuevo.';

export function userMessage(error: unknown): string {
  return error instanceof DomainError ? error.message : GENERIC_ERROR_MESSAGE;
}
