import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SmartLogger } from '../logging/smart-logger.service.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';
import {
  ConflictDomainException,
  NotFoundDomainException,
} from './domain.exception.js';
import type { ErrorResponseBody } from './error-response.js';
import { ErrorTranslator } from './error-translator.port.js';

function createFilter(translators: ErrorTranslator[] = []) {
  const reply = vi.fn();
  const adapterHost = {
    httpAdapter: {
      getRequestUrl: () => '/api/things/1?document=123',
      reply,
    },
  } as unknown as HttpAdapterHost;
  const logError = vi.fn();
  const logger = { error: logError } as unknown as SmartLogger;
  const host = {
    switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter(adapterHost, logger, translators);
  const sentBody = () => reply.mock.calls[0][1] as ErrorResponseBody;
  const sentStatus = () => reply.mock.calls[0][2] as number;
  return { filter, host, sentBody, sentStatus, logError };
}

describe('AllExceptionsFilter', () => {
  it('sends the code of a DomainException', () => {
    const { filter, host, sentBody, sentStatus } = createFilter();

    filter.catch(
      new ConflictDomainException('Sesión repetida.', 'DUPLICATE_SESSION'),
      host,
    );

    expect(sentStatus()).toBe(HttpStatus.CONFLICT);
    expect(sentBody()).toMatchObject({
      statusCode: 409,
      code: 'DUPLICATE_SESSION',
      message: 'Sesión repetida.',
      path: '/api/things/1',
    });
  });

  it('answers 404 with the default code', () => {
    const { filter, host, sentBody } = createFilter();

    filter.catch(new NotFoundDomainException(), host);

    expect(sentBody().code).toBe('NOT_FOUND');
  });

  it('labels validation errors with VALIDATION_ERROR and keeps every message', () => {
    const { filter, host, sentBody } = createFilter();

    filter.catch(
      new BadRequestException(['a must be a string', 'b is required']),
      host,
    );

    expect(sentBody()).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: ['a must be a string', 'b is required'],
    });
  });

  it('derives the code of a plain HttpException from its status', () => {
    const { filter, host, sentBody } = createFilter();

    filter.catch(new BadRequestException('Mala petición'), host);

    expect(sentBody().code).toBe('BAD_REQUEST');
  });

  it('uses the code a translator provides', () => {
    const translator: ErrorTranslator = {
      translate: () => ({
        statusCode: HttpStatus.CONFLICT,
        message: 'Duplicado',
        code: 'DUPLICATE_RECORD',
      }),
    };
    const { filter, host, sentBody } = createFilter([translator]);

    filter.catch(new Error('driver detail'), host);

    expect(sentBody().code).toBe('DUPLICATE_RECORD');
  });

  it('hides unknown errors behind INTERNAL_ERROR and logs them', () => {
    const { filter, host, sentBody, sentStatus, logError } = createFilter();

    filter.catch(new Error('secret detail'), host);

    expect(sentStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(sentBody().code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(sentBody())).not.toContain('secret detail');
    expect(logError).toHaveBeenCalledOnce();
  });
});
