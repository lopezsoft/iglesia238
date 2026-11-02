import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { SmartLogger } from '../logging/smart-logger.service.js';
import { sendErrorResponse } from './error-response.js';
import { ERROR_TRANSLATORS, ErrorTranslator } from './error-translator.port.js';

const INTERNAL_ERROR_MESSAGE = 'Ocurrió un error interno. Intenta de nuevo.';
// Nest repeats the full URL in route-not-found messages, query string included.
const ROUTE_NOT_FOUND_QUERY = /^(Cannot \w+ [^?\s]*)\?\S*$/;

/** Single exception filter: technology-specific errors are delegated to the registered translators. */
@Injectable()
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly logger: SmartLogger,
    @Inject(ERROR_TRANSLATORS)
    private readonly translators: readonly ErrorTranslator[],
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException) {
      this.handleHttpException(exception, host);
      return;
    }

    const translated = this.translate(exception);
    if (translated) {
      sendErrorResponse(
        this.adapterHost,
        host,
        translated.statusCode,
        translated.message,
      );
      return;
    }

    this.logger.error(exception, AllExceptionsFilter.name);
    this.sendInternalError(host);
  }

  private handleHttpException(
    exception: HttpException,
    host: ArgumentsHost,
  ): void {
    const statusCode = exception.getStatus();

    if (statusCode >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error(exception, AllExceptionsFilter.name);
      this.sendInternalError(host);
      return;
    }

    sendErrorResponse(
      this.adapterHost,
      host,
      statusCode,
      this.extractMessage(exception),
    );
  }

  private translate(exception: unknown) {
    for (const translator of this.translators) {
      const translated = translator.translate(exception);
      if (translated) {
        return translated;
      }
    }
    return null;
  }

  private sendInternalError(host: ArgumentsHost): void {
    sendErrorResponse(
      this.adapterHost,
      host,
      HttpStatus.INTERNAL_SERVER_ERROR,
      INTERNAL_ERROR_MESSAGE,
    );
  }

  private extractMessage(exception: HttpException): string | string[] {
    const response = exception.getResponse();
    const message =
      typeof response === 'object' && 'message' in response
        ? (response.message as string | string[])
        : exception.message;

    return typeof message === 'string'
      ? message.replace(ROUTE_NOT_FOUND_QUERY, '$1')
      : message;
  }
}
