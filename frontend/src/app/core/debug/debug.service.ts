import { Injectable, isDevMode } from '@angular/core';

const SENSITIVE_KEY =
  /pass(word)?|token|secret|authorization|cookie|document|email|phone|address|birth|guardian|name/i;
const REDACTED = '[redactado]';
const MAX_DEPTH = 4;

/**
 * The only logging channel of the app. It is silent in production builds and redacts
 * credentials and personal data before anything reaches the console.
 */
@Injectable({ providedIn: 'root' })
export class DebugService {
  private readonly enabled = isDevMode();

  log(message: string, context?: unknown): void {
    this.write('debug', message, context);
  }

  warn(message: string, context?: unknown): void {
    this.write('warn', message, context);
  }

  error(message: string, error?: unknown): void {
    const context = error instanceof Error ? { name: error.name, message: error.message } : error;
    this.write('error', message, context);
  }

  private write(level: 'debug' | 'warn' | 'error', message: string, context: unknown): void {
    if (!this.enabled) {
      return;
    }
    const args = context === undefined ? [message] : [message, redact(context)];
    // eslint-disable-next-line no-console
    console[level](...args);
  }
}

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return '[…]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redact(item, depth + 1),
    ]),
  );
}
