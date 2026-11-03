import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  CliError,
  DEFAULT_CONSTRAINTS_FILE,
  DEFAULT_SCHEMA_DIR,
  REPOSITORY_DIR,
  runCli,
  writeOut,
} from './cli-support.js';
import { buildDataDictionary, renderMarkdown } from './dictionary.js';
import { loadSchemaDocs } from './schema-docs.js';
import { extractCheckConstraints } from './sql-comments.js';

// Usage: npm run db:dictionary [-- --stamp YYYY-MM-DD-HHmm] [--out <dir>] [--json <file>] [--schema <dir>]
// Writes docs/<stamp>-modelo-de-datos.md at the repository root: index by context, an ER diagram per
// context and the dictionary of every table. --json also exports the same data for an HTML viewer.

const STAMP_PATTERN = /^\d{4}-\d{2}-\d{2}-\d{4}$/;

function currentStamp(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

function writeFile(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function main(): boolean {
  const { values } = parseArgs({
    options: {
      stamp: { type: 'string' },
      out: { type: 'string' },
      json: { type: 'string' },
      schema: { type: 'string' },
      constraints: { type: 'string' },
    },
  });
  const stamp = values.stamp ?? currentStamp();
  if (!STAMP_PATTERN.test(stamp)) {
    throw new CliError(
      `--stamp debe tener el formato YYYY-MM-DD-HHmm (recibido "${stamp}").`,
    );
  }

  const docs = loadSchemaDocs(resolve(values.schema ?? DEFAULT_SCHEMA_DIR));
  const constraintsFile = resolve(
    values.constraints ?? DEFAULT_CONSTRAINTS_FILE,
  );
  const checks = existsSync(constraintsFile)
    ? extractCheckConstraints(readFileSync(constraintsFile, 'utf8'))
    : [];
  const dictionary = buildDataDictionary(docs, { stamp, checks });

  const markdownPath = join(
    resolve(values.out ?? join(REPOSITORY_DIR, 'docs')),
    `${stamp}-modelo-de-datos.md`,
  );
  writeFile(markdownPath, renderMarkdown(dictionary));
  writeOut(`Diccionario de datos: ${relative(process.cwd(), markdownPath)}`);

  if (values.json) {
    const jsonPath = resolve(values.json);
    writeFile(jsonPath, `${JSON.stringify(dictionary, null, 2)}\n`);
    writeOut(`Exportación JSON: ${relative(process.cwd(), jsonPath)}`);
  }

  const { summary } = dictionary;
  writeOut(
    `${summary.tables} tablas, ${summary.columns} columnas, ${summary.enums} enumeraciones, ${summary.checks} reglas CHECK.`,
  );
  if (summary.undocumentedTables > 0 || summary.undocumentedColumns > 0) {
    writeOut(
      `Aviso: ${summary.undocumentedTables} tablas y ${summary.undocumentedColumns} columnas sin documentación (npm run db:comments:check).`,
    );
  }
  return true;
}

runCli(main);
