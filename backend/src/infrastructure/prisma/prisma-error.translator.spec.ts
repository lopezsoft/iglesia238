import { HttpStatus } from '@nestjs/common';
import { SmartLogger } from '../../common/logging/smart-logger.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaErrorTranslator } from './prisma-error.translator.js';

const knownError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('detail with personal data', {
    code,
    clientVersion: 'test',
  });

describe('PrismaErrorTranslator', () => {
  const logError = vi.fn();
  const logger = { error: logError } as unknown as SmartLogger;
  const translator = new PrismaErrorTranslator(logger);

  it.each([
    ['P2002', HttpStatus.CONFLICT],
    ['P2003', HttpStatus.CONFLICT],
    ['P2025', HttpStatus.NOT_FOUND],
  ])('maps %s to %i', (code, status) => {
    expect(translator.translate(knownError(code))?.statusCode).toBe(status);
  });

  it('maps unknown codes to a generic 500 without exposing the detail', () => {
    const result = translator.translate(knownError('P9999'));

    expect(result?.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result?.message).not.toContain('personal data');
  });

  it('never logs the message of a validation error', () => {
    const error = new Prisma.PrismaClientValidationError(
      'value: "secret-document"',
      { clientVersion: 'test' },
    );

    expect(translator.translate(error)?.statusCode).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(JSON.stringify(logError.mock.calls)).not.toContain(
      'secret-document',
    );
  });

  it('ignores errors that are not from Prisma', () => {
    expect(translator.translate(new Error('other'))).toBeNull();
  });
});
