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

  it('gives every known error a stable code', () => {
    expect(translator.translate(knownError('P2002'))?.code).toBe(
      'DUPLICATE_RECORD',
    );
    expect(translator.translate(knownError('P2025'))?.code).toBe('NOT_FOUND');
    expect(translator.translate(knownError('P9999'))?.code).toBe(
      'INTERNAL_ERROR',
    );
  });

  describe('MariaDB CHECK violations', () => {
    const checkError = (message: string, code = 'P2039') =>
      new Prisma.PrismaClientKnownRequestError(message, {
        code,
        clientVersion: 'test',
      });

    it('answers 422 with the message of the violated rule', () => {
      const result = translator.translate(
        checkError(
          'Database error. Code: `4025`. Message: `CONSTRAINT `chk_cash_transactions_amount` failed for `church_db`.`cash_transactions``',
        ),
      );

      expect(result).toEqual({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'El valor del movimiento debe ser mayor que cero.',
        code: 'CONSTRAINT_VIOLATION',
      });
    });

    it('recognizes the violation in raw queries too', () => {
      const result = translator.translate(
        checkError(
          'Raw query failed. Code: `4025`. Message: `CONSTRAINT `chk_marriages_spouses` failed`',
          'P2010',
        ),
      );

      expect(result?.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(result?.message).toBe('Los cónyuges no son válidos.');
    });

    it('uses a generic message for a rule without a table entry', () => {
      const result = translator.translate(
        checkError('Database error. Code: `4025`. Message: `unknown`'),
      );

      expect(result?.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(result?.message).toBe(
        'Los datos no cumplen una regla de validación.',
      );
    });

    it('never repeats the driver text, which may contain data', () => {
      const result = translator.translate(
        checkError(
          'Database error. Code: `4025`. Message: `CONSTRAINT `chk_persons_document` failed for row 123456789`',
        ),
      );

      expect(JSON.stringify(result)).not.toContain('123456789');
    });

    it('keeps other driver errors as internal errors', () => {
      const result = translator.translate(
        checkError('Database error. Code: `1146`. Message: `table missing`'),
      );

      expect(result?.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  it('ignores errors that are not from Prisma', () => {
    expect(translator.translate(new Error('other'))).toBeNull();
  });
});
