import 'dotenv/config';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  CliError,
  DEFAULT_SCHEMA_DIR,
  runCli,
  writeError,
  writeOut,
} from './cli-support.js';
import type {
  CommentDrift,
  DatabaseColumnComment,
  DatabaseTableComment,
} from './comment-checks.js';
import { compareWithDatabase, findUndocumented } from './comment-checks.js';
import type { SchemaDocs } from './schema-docs.js';
import { loadSchemaDocs } from './schema-docs.js';

// Usage: npm run db:comments:check [-- --db] [--schema <dir>]
// Fails (exit 1) if a model or a column lacks `///` documentation. Meant for CI and for running before
// `prisma migrate dev`. With --db it also compares the schema with TABLE_COMMENT and COLUMN_COMMENT of the
// database in DATABASE_URL, loaded from .env the same way prisma.config.ts does. The URL is never printed.

const DRIFT_LABELS: Record<CommentDrift['kind'], string> = {
  'missing-table': 'la tabla no existe en la base',
  'missing-column': 'la columna no existe en la base',
  'empty-comment': 'sin COMMENT en la base',
  'different-comment': 'el COMMENT de la base no coincide con el esquema',
};

function reportUndocumented(docs: SchemaDocs): boolean {
  const items = findUndocumented(docs);
  if (items.length === 0) {
    writeOut(
      `Documentación completa: ${docs.models.length} modelos y todas sus columnas tienen ///.`,
    );
    return true;
  }
  let file = '';
  for (const item of items) {
    if (item.file !== file) {
      file = item.file;
      writeError(`\nprisma/schema/${file}`);
    }
    writeError(
      item.field === null
        ? `  línea ${item.line}: modelo ${item.model} (tabla ${item.table})`
        : `  línea ${item.line}: ${item.model}.${item.field} (columna ${item.table}.${item.column})`,
    );
  }
  const models = items.filter((i) => i.field === null).length;
  writeError(
    `\nFalta documentación /// en ${models} modelo(s) y ${items.length - models} columna(s).`,
  );
  return false;
}

async function readDatabaseComments(): Promise<{
  tables: DatabaseTableComment[];
  columns: DatabaseColumnComment[];
}> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new CliError(
      'DATABASE_URL es obligatoria para --db (se lee del entorno o de backend/.env).',
    );
  }
  // Loaded only for --db, so the static check works without the generated client or a database.
  const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
  const { PrismaClient } = await import('../../src/generated/prisma/client.js');
  const { parseMariaDbUrl } =
    await import('../../src/infrastructure/prisma/mariadb-connection.js');
  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(parseMariaDbUrl(databaseUrl)),
  });
  try {
    // Read-only queries on information_schema.
    const tables = await prisma.$queryRaw<DatabaseTableComment[]>`
      SELECT TABLE_NAME AS tableName, TABLE_COMMENT AS tableComment
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`;
    const columns = await prisma.$queryRaw<DatabaseColumnComment[]>`
      SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_COMMENT AS columnComment
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`;
    return { tables, columns };
  } finally {
    await prisma.$disconnect();
  }
}

function reportDrift(drifts: CommentDrift[]): boolean {
  if (drifts.length === 0) {
    writeOut(
      'Base de datos: los COMMENT de tablas y columnas coinciden con el esquema.',
    );
    return true;
  }
  writeError('\nDiferencias con la base de datos:');
  for (const drift of drifts) {
    const target =
      drift.column === null
        ? `tabla ${drift.table}`
        : `columna ${drift.table}.${drift.column}`;
    writeError(`  ${target}: ${DRIFT_LABELS[drift.kind]}`);
  }
  writeError(
    `\n${drifts.length} diferencia(s). Una migración nueva con los COMMENT (npm run db:comments:inject) las corrige.`,
  );
  return false;
}

async function main(): Promise<boolean> {
  const { values } = parseArgs({
    options: {
      db: { type: 'boolean', default: false },
      schema: { type: 'string' },
    },
  });
  const docs = loadSchemaDocs(resolve(values.schema ?? DEFAULT_SCHEMA_DIR));
  const documented = reportUndocumented(docs);
  if (!values.db) {
    return documented;
  }
  const { tables, columns } = await readDatabaseComments();
  const inSync = reportDrift(compareWithDatabase(docs, tables, columns));
  return documented && inSync;
}

runCli(main);
