import { HttpErrorResponse } from '@angular/common/http';
import { DomainError } from '../errors/domain-error';

interface ApiErrorBody {
  readonly code?: unknown;
  readonly message?: unknown;
}

interface StatusDefault {
  readonly code: string;
  readonly message: string;
}

/** Spanish fallbacks for when the API sends no usable `code` / `message`. */
const DEFAULTS: Readonly<Record<number, StatusDefault>> = {
  400: { code: 'VALIDATION_ERROR', message: 'Revisa los datos ingresados.' },
  401: { code: 'UNAUTHENTICATED', message: 'Tu sesión expiró. Ingresa de nuevo.' },
  403: { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' },
  404: { code: 'NOT_FOUND', message: 'No encontramos lo que buscas.' },
  409: { code: 'CONFLICT', message: 'La operación entra en conflicto con el estado actual de los datos.' },
  422: { code: 'VALIDATION_ERROR', message: 'Revisa los datos ingresados.' },
  // The API's rate limiter answers 429 RATE_LIMITED. A locked account answers a plain 401 on purpose.
  429: { code: 'RATE_LIMITED', message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
};

const NETWORK_ERROR: StatusDefault = {
  code: 'NETWORK_ERROR',
  message: 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.',
};

const SERVER_ERROR: StatusDefault = {
  code: 'SERVER_ERROR',
  message: 'El servidor no pudo completar la operación. Inténtalo de nuevo en unos minutos.',
};

const GENERIC_ERROR: StatusDefault = {
  code: 'UNEXPECTED_ERROR',
  message: 'No fue posible completar la operación. Intenta de nuevo.',
};

/**
 * Turns an API failure into the DomainError the screens already understand. The API body
 * `{ statusCode, error, code, message }` supplies the `code` and a Spanish `message` that is
 * safe to show; server faults (5xx) and failures without a body get a generic text instead, so
 * stack traces or driver messages never reach the user.
 */
export function toDomainError(error: HttpErrorResponse): DomainError {
  const fallback = fallbackFor(error.status);
  const body = isBody(error.error) ? error.error : null;
  const code = typeof body?.code === 'string' && body.code !== '' ? body.code : fallback.code;
  const message = error.status >= 500 ? fallback.message : readMessage(body, fallback.message);
  return new DomainError(code, message, error.status, readRetryAfter(error));
}

function fallbackFor(status: number): StatusDefault {
  if (status === 0) {
    return NETWORK_ERROR;
  }
  if (status >= 500) {
    return SERVER_ERROR;
  }
  return DEFAULTS[status] ?? GENERIC_ERROR;
}

function isBody(value: unknown): value is ApiErrorBody {
  return typeof value === 'object' && value !== null;
}

function readMessage(body: ApiErrorBody | null, fallback: string): string {
  const message = body?.message;
  if (typeof message === 'string' && message.trim() !== '') {
    return message;
  }
  if (Array.isArray(message)) {
    const texts = message.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
    if (texts.length > 0) {
      return texts.join(' ');
    }
  }
  return fallback;
}

function readRetryAfter(error: HttpErrorResponse): number | null {
  const seconds = Number(error.headers?.get('Retry-After'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
