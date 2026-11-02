import { ConsoleLogger, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogLevel, Environment } from '../../config/environment.js';
import { redactSensitiveData } from './sensitive-data-redactor.js';

const LOG_LEVEL_ORDER: readonly AppLogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

/** Single logging channel of the application: applies levels and redaction in one place. */
@Injectable()
export class SmartLogger extends ConsoleLogger {
  constructor(config: ConfigService<Environment, true>) {
    const level = config.get('LOG_LEVEL', { infer: true });
    const isProduction =
      config.get('NODE_ENV', { infer: true }) === 'production';

    super({
      logLevels: LOG_LEVEL_ORDER.slice(0, LOG_LEVEL_ORDER.indexOf(level) + 1),
      json: isProduction,
    });
  }

  override log(message: unknown, ...optional: unknown[]): void {
    super.log(redactSensitiveData(message), ...this.redactAll(optional));
  }

  override error(message: unknown, ...optional: unknown[]): void {
    super.error(redactSensitiveData(message), ...this.redactAll(optional));
  }

  override warn(message: unknown, ...optional: unknown[]): void {
    super.warn(redactSensitiveData(message), ...this.redactAll(optional));
  }

  override debug(message: unknown, ...optional: unknown[]): void {
    super.debug(redactSensitiveData(message), ...this.redactAll(optional));
  }

  override verbose(message: unknown, ...optional: unknown[]): void {
    super.verbose(redactSensitiveData(message), ...this.redactAll(optional));
  }

  override fatal(message: unknown, ...optional: unknown[]): void {
    super.fatal(redactSensitiveData(message), ...this.redactAll(optional));
  }

  private redactAll(values: unknown[]): unknown[] {
    return values.map((value) => redactSensitiveData(value));
  }
}
