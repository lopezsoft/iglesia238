import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ErrorCode } from './domain.exception.js';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  /** Stable identifier of the error kind; the message is for people, the code is for programs. */
  code: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/** Code used when the error was not raised as a DomainException. */
export function defaultErrorCode(
  statusCode: number,
  message: string | string[],
): string {
  if (statusCode === Number(HttpStatus.BAD_REQUEST) && Array.isArray(message)) {
    return ErrorCode.VALIDATION_ERROR;
  }
  return HttpStatus[statusCode] ?? ErrorCode.INTERNAL_ERROR;
}

/** Writes the single error format of the API. The query string is dropped: it may carry personal data. */
export function sendErrorResponse(
  adapterHost: HttpAdapterHost,
  host: ArgumentsHost,
  statusCode: HttpStatus,
  message: string | string[],
  code: string = defaultErrorCode(statusCode, message),
): void {
  const { httpAdapter } = adapterHost;
  const http = host.switchToHttp();
  const request: unknown = http.getRequest();
  const url = String(httpAdapter.getRequestUrl(request));

  const body: ErrorResponseBody = {
    statusCode,
    error: HttpStatus[statusCode] ?? 'ERROR',
    code,
    message,
    path: url.split('?')[0],
    timestamp: new Date().toISOString(),
  };

  httpAdapter.reply(http.getResponse(), body, statusCode);
}
