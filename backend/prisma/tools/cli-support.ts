import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { SchemaParseError } from './schema-docs.js';

/** `backend/`, resolved from this file so the commands work from any working directory. */
export const BACKEND_DIR = fileURLToPath(new URL('../..', import.meta.url));
export const REPOSITORY_DIR = resolve(BACKEND_DIR, '..');
export const DEFAULT_SCHEMA_DIR = resolve(BACKEND_DIR, 'prisma/schema');
export const DEFAULT_CONSTRAINTS_FILE = resolve(
  BACKEND_DIR,
  'prisma/sql/constraints.sql',
);

/** Error with a message meant for the person running the command: printed as is, without a stack. */
export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

export function writeOut(text: string): void {
  process.stdout.write(`${text}\n`);
}

export function writeError(text: string): void {
  process.stderr.write(`${text}\n`);
}

/** Runs the command and turns its result into the exit code: 0 when it returns true, 1 otherwise. */
export function runCli(main: () => Promise<boolean> | boolean): void {
  Promise.resolve()
    .then(main)
    .then((ok) => {
      process.exitCode = ok ? 0 : 1;
    })
    .catch((error: unknown) => {
      if (error instanceof CliError || error instanceof SchemaParseError) {
        writeError(error.message);
      } else {
        writeError('Error inesperado.');
        if (error instanceof Error) {
          writeError(error.message);
        }
      }
      process.exitCode = 1;
    });
}
