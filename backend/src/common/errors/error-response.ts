import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/** Writes the single error format of the API. The query string is dropped: it may carry personal data. */
export function sendErrorResponse(
  adapterHost: HttpAdapterHost,
  host: ArgumentsHost,
  statusCode: HttpStatus,
  message: string | string[],
): void {
  const { httpAdapter } = adapterHost;
  const http = host.switchToHttp();
  const request: unknown = http.getRequest();
  const url = String(httpAdapter.getRequestUrl(request));

  const body: ErrorResponseBody = {
    statusCode,
    error: HttpStatus[statusCode] ?? 'ERROR',
    message,
    path: url.split('?')[0],
    timestamp: new Date().toISOString(),
  };

  httpAdapter.reply(http.getResponse(), body, statusCode);
}
