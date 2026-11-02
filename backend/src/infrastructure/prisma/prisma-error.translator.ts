import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ErrorTranslator,
  TranslatedError,
} from '../../common/errors/error-translator.port.js';
import { SmartLogger } from '../../common/logging/smart-logger.service.js';
import { Prisma } from '../../generated/prisma/client.js';

const KNOWN_ERRORS: Readonly<Record<string, TranslatedError>> = {
  P2002: {
    statusCode: HttpStatus.CONFLICT,
    message: 'Ya existe un registro con esos datos.',
  },
  P2003: {
    statusCode: HttpStatus.CONFLICT,
    message: 'La operación hace referencia a un registro inexistente o en uso.',
  },
  P2025: {
    statusCode: HttpStatus.NOT_FOUND,
    message: 'El registro no existe.',
  },
};

const INTERNAL_ERROR: TranslatedError = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  message: 'Ocurrió un error interno. Intenta de nuevo.',
};

/** Keeps Prisma error codes inside the infrastructure layer. Messages may contain data, so they are never logged. */
@Injectable()
export class PrismaErrorTranslator implements ErrorTranslator {
  constructor(private readonly logger: SmartLogger) {}

  translate(exception: unknown): TranslatedError | null {
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
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
}
