import { HttpStatus } from '@nestjs/common';
import {
  BusinessRuleException,
  ConflictDomainException,
  DomainException,
  ErrorCode,
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
  TooManyRequestsException,
  UnauthenticatedException,
} from './domain.exception.js';

describe('DomainException hierarchy', () => {
  it.each([
    [
      new InvalidInputException('x'),
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
    ],
    [
      new UnauthenticatedException(),
      HttpStatus.UNAUTHORIZED,
      'UNAUTHENTICATED',
    ],
    [new ForbiddenDomainException(), HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [new NotFoundDomainException(), HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [new ConflictDomainException('x'), HttpStatus.CONFLICT, 'CONFLICT'],
    [
      new BusinessRuleException('x'),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'BUSINESS_RULE',
    ],
    [
      new TooManyRequestsException(90),
      HttpStatus.TOO_MANY_REQUESTS,
      'RATE_LIMITED',
    ],
  ])('%o has status %i and code %s', (exception, status, code) => {
    expect(exception).toBeInstanceOf(DomainException);
    expect(exception.getStatus()).toBe(status);
    expect(exception.code).toBe(code);
  });

  it('accepts a specific code', () => {
    const exception = new ConflictDomainException(
      'Ya existe una sesión para esa fecha.',
      'DUPLICATE_SESSION',
    );

    expect(exception.code).toBe('DUPLICATE_SESSION');
    expect(exception.getResponse()).toEqual({
      code: 'DUPLICATE_SESSION',
      message: 'Ya existe una sesión para esa fecha.',
    });
  });

  it('exposes the retry delay of a rate limit in minutes, rounded up', () => {
    const exception = new TooManyRequestsException(61);

    expect(exception.retryAfterSeconds).toBe(61);
    expect(exception.message).toContain('2 minuto');
  });

  it('keeps the catalog of codes stable', () => {
    expect(Object.values(ErrorCode)).toContain('SCOPE_REQUIRED');
  });
});
