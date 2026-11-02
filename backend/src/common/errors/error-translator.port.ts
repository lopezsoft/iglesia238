import { HttpStatus } from '@nestjs/common';

export interface TranslatedError {
  statusCode: HttpStatus;
  message: string;
}

/**
 * Port that maps technology-specific errors (e.g. database) to HTTP errors.
 * Adding a technology means adding a translator, not changing the filter.
 */
export interface ErrorTranslator {
  /** Returns null when the exception does not belong to this translator. */
  translate(exception: unknown): TranslatedError | null;
}

export const ERROR_TRANSLATORS = Symbol('ERROR_TRANSLATORS');
