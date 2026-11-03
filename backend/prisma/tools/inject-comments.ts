import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  CliError,
  DEFAULT_SCHEMA_DIR,
  runCli,
  writeError,
  writeOut,
} from './cli-support.js';
import { loadSchemaDocs } from './schema-docs.js';
import { CommentInjectionError, injectComments } from './sql-comments.js';

// Usage: npm run db:comments:inject -- prisma/migrations/<migration>/migration.sql [--check] [--schema <dir>]
// Adds COMMENT clauses from the schema `///` documentation to the tables and columns that the migration
// creates or redefines, and rewrites the file in place. Run it after `prisma migrate dev --create-only`
// and before applying the migration. With --check nothing is written: it fails if comments are missing.

const USAGE =
  'Uso: npm run db:comments:inject -- <migration.sql> [más archivos] [--check] [--schema <dir>]';

function main(): boolean {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      check: { type: 'boolean', default: false },
      schema: { type: 'string' },
    },
  });
  if (positionals.length === 0) {
    throw new CliError(USAGE);
  }
  const docs = loadSchemaDocs(resolve(values.schema ?? DEFAULT_SCHEMA_DIR));

  let ok = true;
  for (const file of positionals) {
    const path = resolve(file);
    let sql: string;
    try {
      sql = readFileSync(path, 'utf8');
    } catch {
      throw new CliError(`No se pudo leer ${path}.`);
    }
    try {
      const result = injectComments(sql, docs);
      const tables = result.added.filter((a) => a.column === null).length;
      const columns = result.added.length - tables;
      if (values.check) {
        if (result.added.length > 0) {
          ok = false;
          writeError(
            `${file}: faltan ${tables} comentario(s) de tabla y ${columns} de columna. Ejecuta npm run db:comments:inject -- ${file}`,
          );
        } else {
          writeOut(
            `${file}: todos los comentarios están presentes (${result.alreadyCommented}).`,
          );
        }
        continue;
      }
      if (result.added.length > 0) {
        writeFileSync(path, result.sql, 'utf8');
      }
      writeOut(
        `${file}: ${tables} comentario(s) de tabla y ${columns} de columna agregados; ${result.alreadyCommented} ya existían.`,
      );
    } catch (error) {
      if (!(error instanceof CommentInjectionError)) {
        throw error;
      }
      ok = false;
      writeError(`${file}: ${error.message}`);
      writeError(
        'Documenta esos modelos y campos con /// en prisma/schema y vuelve a ejecutar el comando.',
      );
    }
  }
  return ok;
}

runCli(main);
