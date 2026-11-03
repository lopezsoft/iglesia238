import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorTranslator,
  TranslatedError,
} from '../../common/errors/error-translator.port.js';
import { SmartLogger } from '../../common/logging/smart-logger.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  CHECK_CONSTRAINT_MESSAGES,
  GENERIC_CHECK_MESSAGE,
  checkConstraintName,
} from './check-constraint-messages.js';

const KNOWN_ERRORS: Readonly<Record<string, TranslatedError>> = {
  P2002: {
    statusCode: HttpStatus.CONFLICT,
    message: 'Ya existe un registro con esos datos.',
    code: 'DUPLICATE_RECORD',
  },
  P2003: {
    statusCode: HttpStatus.CONFLICT,
    message: 'La operación hace referencia a un registro inexistente o en uso.',
    code: 'REFERENCE_CONFLICT',
  },
  P2025: {
    statusCode: HttpStatus.NOT_FOUND,
    message: 'El registro no existe.',
    code: 'NOT_FOUND',
  },
};

// Prisma reports driver errors it has no dedicated code for as P2039 (or P2010 in raw queries).
const DRIVER_ERROR_CODES: readonly string[] = ['P2039', 'P2010'];
// ER_CONSTRAINT_FAILED: MariaDB's error number for a violated CHECK.
const CHECK_FAILED_DRIVER_CODE = '4025';
const CHECK_VIOLATION_CODE = 'CONSTRAINT_VIOLATION';

const INTERNAL_ERROR: TranslatedError = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  message: 'Ocurrió un error interno. Intenta de nuevo.',
  code: 'INTERNAL_ERROR',
};

/** Keeps Prisma error codes inside the infrastructure layer. Messages may contain data, so they are never logged. */
@Injectable()
export class PrismaErrorTranslator implements ErrorTranslator {
  constructor(private readonly logger: SmartLogger) {}

  translate(exception: unknown): TranslatedError | null {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const violation = this.translateCheckViolation(exception);
      if (violation) {
        return violation;
      }
      const known = KNOWN_ERRORS[exception.code];
      if (!known) {
        this.logger.error(
          `Unhandled database error ${exception.code}`,
          PrismaErrorTranslator.name,
        );
      }
      return known ?? INTERNAL_ERROR;
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.error(
        'Invalid database query (PrismaClientValidationError)',
        PrismaErrorTranslator.name,
      );
      return INTERNAL_ERROR;
    }

    return null;
  }

  /** A violated CHECK is the caller's data, not a server fault: 422 with the message of that rule. */
  private translateCheckViolation(
    exception: Prisma.PrismaClientKnownRequestError,
  ): TranslatedError | null {
    if (!DRIVER_ERROR_CODES.includes(exception.code)) {
      return null;
    }
    const name = checkConstraintName(exception.message);
    const isCheck =
      name !== null ||
      exception.message.includes(`Code: \`${CHECK_FAILED_DRIVER_CODE}\``);
    if (!isCheck) {
      return null;
    }
    // The constraint name only selects a message; the driver text, which may hold data, is dropped.
    return {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      message:
        (name && CHECK_CONSTRAINT_MESSAGES[name]) || GENERIC_CHECK_MESSAGE,
      code: CHECK_VIOLATION_CODE,
    };
  }
}
