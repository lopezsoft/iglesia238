import { HttpException, HttpStatus } from '@nestjs/common';

/** Stable codes the frontend maps to its own messages. They never change once published. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  BUSINESS_RULE: 'BUSINESS_RULE',
  RATE_LIMITED: 'RATE_LIMITED',
  SCOPE_REQUIRED: 'SCOPE_REQUIRED',
  SCOPE_INVALID: 'SCOPE_INVALID',
  SCOPE_FORBIDDEN: 'SCOPE_FORBIDDEN',
  PLATFORM_SCOPE_NOT_ALLOWED: 'PLATFORM_SCOPE_NOT_ALLOWED',
  CONGREGATION_SCOPE_REQUIRED: 'CONGREGATION_SCOPE_REQUIRED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Base of every error the business rules raise on purpose. It carries a stable `code` next to the
 * Spanish message, so the API answers with the right status and the frontend can react to the code.
 */
export class DomainException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus,
  ) {
    super({ code, message }, status);
  }
}

/** 400: the request is well formed but a value is not acceptable. */
export class InvalidInputException extends DomainException {
  constructor(message: string, code: string = ErrorCode.VALIDATION_ERROR) {
    super(code, message, HttpStatus.BAD_REQUEST);
  }
}

/** 401: no valid credentials. The message must not reveal which part was wrong. */
export class UnauthenticatedException extends DomainException {
  constructor(
    message = 'Tu sesión no es válida. Inicia sesión de nuevo.',
    code: string = ErrorCode.UNAUTHENTICATED,
  ) {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

/** 403: authenticated but not allowed. */
export class ForbiddenDomainException extends DomainException {
  constructor(
    message = 'No tienes permiso para realizar esta acción.',
    code: string = ErrorCode.FORBIDDEN,
  ) {
    super(code, message, HttpStatus.FORBIDDEN);
  }
}

/**
 * 404. It is also the answer for a resource of another tenant: saying 403 would confirm that it exists.
 */
export class NotFoundDomainException extends DomainException {
  constructor(
    message = 'El registro no existe.',
    code: string = ErrorCode.NOT_FOUND,
  ) {
    super(code, message, HttpStatus.NOT_FOUND);
  }
}

/** 409: the operation collides with the current state (duplicate, closed period, record in use). */
export class ConflictDomainException extends DomainException {
  constructor(message: string, code: string = ErrorCode.CONFLICT) {
    super(code, message, HttpStatus.CONFLICT);
  }
}

/** 422: the request is valid but a business rule rejects it. */
export class BusinessRuleException extends DomainException {
  constructor(message: string, code: string = ErrorCode.BUSINESS_RULE) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** 429: too many attempts in the window. */
export class TooManyRequestsException extends DomainException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      ErrorCode.RATE_LIMITED,
      `Demasiados intentos. Intenta de nuevo en ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minuto(s).`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** 503: a dependency the operation needs is down. The message is safe to show. */
export class ServiceUnavailableDomainException extends DomainException {
  constructor(
    message = 'El servicio no está disponible por ahora. Intenta de nuevo en unos minutos.',
    code: string = ErrorCode.SERVICE_UNAVAILABLE,
  ) {
    super(code, message, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
