import type { SchemaDocs, SchemaModel } from './schema-docs.js';

// Adds the schema `///` documentation to a MariaDB migration as COMMENT clauses. Prisma does not emit them
// for MySQL/MariaDB, so every migration goes through this step before it is applied.
//
// The SQL is never parsed into a tree: a masked copy (same length, comments blanked and the contents of
// strings and quoted identifiers replaced) lets plain scans find the structure, and the edits are inserted
// at offsets of the original text, so the rest of the migration keeps its exact formatting.

/** MariaDB limits, in characters. */
export const COLUMN_COMMENT_MAX_LENGTH = 1024;
export const TABLE_COMMENT_MAX_LENGTH = 2048;

/** Keywords that start a key or constraint inside CREATE TABLE, instead of a column definition. */
const CREATE_TABLE_NON_COLUMN = new Set([
  'PRIMARY',
  'UNIQUE',
  'KEY',
  'INDEX',
  'CONSTRAINT',
  'FOREIGN',
  'FULLTEXT',
  'SPATIAL',
  'CHECK',
  'PERIOD',
  'SYSTEM',
]);

/** `ADD <keyword>` forms of ALTER TABLE that do not add a column. */
const ALTER_ADD_NON_COLUMN = new Set([...CREATE_TABLE_NON_COLUMN, 'PARTITION']);

/** A column COMMENT goes before these trailing parts of a column definition. */
const COLUMN_TAIL_KEYWORDS = new Set([
  'REFERENCES',
  'CHECK',
  'CONSTRAINT',
  'FIRST',
  'AFTER',
]);

/** The table COMMENT goes before these parts of CREATE TABLE, when present. */
const TABLE_TAIL_KEYWORDS = new Set([
  'PARTITION',
  'AS',
  'SELECT',
  'IGNORE',
  'REPLACE',
]);

const COMMENT_KEYWORD = new Set(['COMMENT']);

export function escapeSqlString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

/**
 * Copy of the SQL with the same length: comments become spaces and the contents of strings and quoted
 * identifiers become "_", so keywords, commas and parentheses inside them are not mistaken for structure.
 */
export function maskSql(sql: string): string {
  const out = sql.split('');
  const blank = (from: number, to: number, char: string): void => {
    for (let k = from; k < to; k++) {
      if (out[k] !== '\n' && out[k] !== '\r') {
        out[k] = char;
      }
    }
  };
  const length = sql.length;
  let i = 0;
  while (i < length) {
    const char = sql[i];
    if (char === "'" || char === '"' || char === '`') {
      let j = i + 1;
      while (j < length) {
        if (sql[j] === '\\' && char !== '`') {
          j += 2;
        } else if (sql[j] === char && sql[j + 1] === char) {
          j += 2;
        } else if (sql[j] === char) {
          break;
        } else {
          j++;
        }
      }
      blank(i + 1, Math.min(j, length), '_');
      i = j + 1;
    } else if (
      (char === '-' &&
        sql[i + 1] === '-' &&
        (i + 2 >= length || /\s/.test(sql[i + 2]))) ||
      char === '#'
    ) {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? length : end;
      blank(i, stop, ' ');
      i = stop;
    } else if (char === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? length : end + 2;
      blank(i, stop, ' ');
      i = stop;
    } else {
      i++;
    }
  }
  return out.join('');
}

interface Range {
  start: number;
  end: number;
}

/** Statement ranges, without the `;`. */
export function splitStatements(masked: string): Range[] {
  const statements: Range[] = [];
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === ';') {
      statements.push({ start, end: i });
      start = i + 1;
    }
  }
  if (masked.slice(start).trim().length > 0) {
    statements.push({ start, end: masked.length });
  }
  return statements;
}

/** Splits a range on the commas that are outside parentheses. */
function splitTopLevel(masked: string, start: number, end: number): Range[] {
  const parts: Range[] = [];
  let depth = 0;
  let partStart = start;
  for (let i = start; i < end; i++) {
    const char = masked[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      parts.push({ start: partStart, end: i });
      partStart = i + 1;
    }
  }
  parts.push({ start: partStart, end });
  return parts;
}

function skipSpace(masked: string, i: number, end: number): number {
  let position = i;
  while (position < end && /\s/.test(masked[position])) {
    position++;
  }
  return position;
}

function trimEnd(masked: string, start: number, end: number): number {
  let position = end;
  while (position > start && /\s/.test(masked[position - 1])) {
    position--;
  }
  return position;
}

/** Position after the keywords, each one separated by whitespace, or null if they are not there. */
function keywordsAt(
  masked: string,
  i: number,
  end: number,
  ...words: string[]
): number | null {
  let position = i;
  for (const [index, word] of words.entries()) {
    if (index > 0) {
      const next = skipSpace(masked, position, end);
      if (next === position) {
        return null;
      }
      position = next;
    }
    const candidate = masked.slice(position, position + word.length);
    const after = masked[position + word.length];
    if (
      position + word.length > end ||
      candidate.toUpperCase() !== word ||
      (after !== undefined && /[\w$]/.test(after))
    ) {
      return null;
    }
    position += word.length;
  }
  return position;
}

/** Optional keywords: the position after them, or the same position. */
function optionalKeywords(
  masked: string,
  i: number,
  end: number,
  ...words: string[]
): number {
  const after = keywordsAt(masked, i, end, ...words);
  return after === null ? i : skipSpace(masked, after, end);
}

interface Identifier {
  name: string;
  quoted: boolean;
  end: number;
}

/** Reads `name`, `` `name` `` or a qualified `` `db`.`name` `` (the last part is returned). */
function readIdentifier(
  sql: string,
  masked: string,
  i: number,
  end: number,
): Identifier | null {
  let identifier: Identifier;
  if (masked[i] === '`') {
    const close = masked.indexOf('`', i + 1);
    if (close === -1 || close >= end) {
      return null;
    }
    identifier = {
      name: sql.slice(i + 1, close).replace(/``/g, '`'),
      quoted: true,
      end: close + 1,
    };
  } else {
    const word = /[\w$]+/y;
    word.lastIndex = i;
    const match = word.exec(masked);
    if (!match || i + match[0].length > end) {
      return null;
    }
    identifier = { name: match[0], quoted: false, end: i + match[0].length };
  }
  if (masked[identifier.end] === '.') {
    return readIdentifier(sql, masked, identifier.end + 1, end) ?? identifier;
  }
  return identifier;
}

function closingParen(masked: string, open: number, end: number): number {
  let depth = 0;
  for (let i = open; i < end; i++) {
    if (masked[i] === '(') {
      depth++;
    } else if (masked[i] === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** First of the keywords found outside parentheses, or null. */
function findTopLevelKeyword(
  masked: string,
  start: number,
  end: number,
  words: Set<string>,
): number | null {
  let depth = 0;
  const word = /[A-Za-z_]\w*/y;
  for (let i = start; i < end; i++) {
    const char = masked[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (
      depth === 0 &&
      /[A-Za-z_]/.test(char) &&
      (i === 0 || !/[\w$]/.test(masked[i - 1]))
    ) {
      word.lastIndex = i;
      const match = word.exec(masked);
      if (match && i + match[0].length <= end) {
        if (words.has(match[0].toUpperCase())) {
          return i;
        }
        i += match[0].length - 1;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------

export interface AddedComment {
  table: string;
  /** Null for the table comment. */
  column: string | null;
  line: number;
}

export interface InjectionResult {
  sql: string;
  added: AddedComment[];
  /** Columns and tables that already had a COMMENT and were left as they were. */
  alreadyCommented: number;
}

export class CommentInjectionError extends Error {
  constructor(readonly problems: string[]) {
    super(
      `No se pudieron agregar los comentarios (${problems.length} problema(s)):\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
    this.name = 'CommentInjectionError';
  }
}

interface Edit {
  position: number;
  text: string;
}

/**
 * Adds COMMENT to every column definition of CREATE TABLE and ALTER TABLE ... ADD/MODIFY/CHANGE, and the
 * table COMMENT to every CREATE TABLE. Idempotent: definitions that already have a COMMENT are left alone.
 * Throws CommentInjectionError, without changing anything, if a table or column lacks documentation.
 */
export function injectComments(sql: string, docs: SchemaDocs): InjectionResult {
  return new CommentInjector(sql, docs).run();
}

class CommentInjector {
  private readonly masked: string;
  private readonly tables: Map<string, SchemaModel>;
  private readonly edits: Edit[] = [];
  private readonly added: AddedComment[] = [];
  private readonly problems: string[] = [];
  private alreadyCommented = 0;

  constructor(
    private readonly sql: string,
    docs: SchemaDocs,
  ) {
    this.masked = maskSql(sql);
    this.tables = new Map(docs.models.map((model) => [model.tableName, model]));
  }

  run(): InjectionResult {
    for (const statement of splitStatements(this.masked)) {
      const start = skipSpace(this.masked, statement.start, statement.end);
      if (!this.createTable(start, statement.end)) {
        this.alterTable(start, statement.end);
      }
    }
    if (this.problems.length > 0) {
      throw new CommentInjectionError(this.problems);
    }
    let result = this.sql;
    for (const edit of [...this.edits].sort(
      (a, b) => b.position - a.position,
    )) {
      result =
        result.slice(0, edit.position) +
        edit.text +
        result.slice(edit.position);
    }
    return {
      sql: result,
      added: this.added,
      alreadyCommented: this.alreadyCommented,
    };
  }

  private lineOf(position: number): number {
    let line = 1;
    for (let i = 0; i < position; i++) {
      if (this.sql[i] === '\n') {
        line++;
      }
    }
    return line;
  }

  private findModel(table: string, position: number): SchemaModel | null {
    const model = this.tables.get(table);
    if (!model) {
      this.problems.push(
        `línea ${this.lineOf(position)}: la tabla \`${table}\` no corresponde a ningún modelo del esquema Prisma.`,
      );
      return null;
    }
    return model;
  }

  private createTable(start: number, end: number): boolean {
    const m = this.masked;
    let i = keywordsAt(m, start, end, 'CREATE');
    if (i === null) {
      return false;
    }
    i = skipSpace(m, i, end);
    i = optionalKeywords(m, i, end, 'OR', 'REPLACE');
    i = optionalKeywords(m, i, end, 'TEMPORARY');
    const afterTable = keywordsAt(m, i, end, 'TABLE');
    if (afterTable === null) {
      return false;
    }
    i = optionalKeywords(
      m,
      skipSpace(m, afterTable, end),
      end,
      'IF',
      'NOT',
      'EXISTS',
    );
    const table = readIdentifier(this.sql, m, i, end);
    if (!table) {
      return true;
    }
    const open = skipSpace(m, table.end, end);
    const close = m[open] === '(' ? closingParen(m, open, end) : -1;
    if (close === -1) {
      // CREATE TABLE ... LIKE or AS SELECT: no column definitions to document.
      return true;
    }
    const model = this.findModel(table.name, start);
    if (!model) {
      return true;
    }
    for (const item of splitTopLevel(m, open + 1, close)) {
      const itemStart = skipSpace(m, item.start, item.end);
      const column = readIdentifier(this.sql, m, itemStart, item.end);
      if (
        !column ||
        (!column.quoted &&
          CREATE_TABLE_NON_COLUMN.has(column.name.toUpperCase()))
      ) {
        continue;
      }
      this.commentColumn(model, column.name, itemStart, column.end, item.end);
    }
    this.commentTable(model, start, close + 1, end);
    return true;
  }

  private alterTable(start: number, end: number): void {
    const m = this.masked;
    let i = keywordsAt(m, start, end, 'ALTER');
    if (i === null) {
      return;
    }
    i = skipSpace(m, i, end);
    i = optionalKeywords(m, i, end, 'ONLINE');
    i = optionalKeywords(m, i, end, 'IGNORE');
    const afterTable = keywordsAt(m, i, end, 'TABLE');
    if (afterTable === null) {
      return;
    }
    i = optionalKeywords(m, skipSpace(m, afterTable, end), end, 'IF', 'EXISTS');
    const table = readIdentifier(this.sql, m, i, end);
    if (!table) {
      return;
    }
    let model: SchemaModel | null | undefined;
    for (const clause of splitTopLevel(m, table.end, end)) {
      const clauseStart = skipSpace(m, clause.start, clause.end);
      const column = this.alteredColumn(clauseStart, clause.end);
      if (!column) {
        continue;
      }
      if (model === undefined) {
        model = this.findModel(table.name, clauseStart);
      }
      if (model) {
        this.commentColumn(
          model,
          column.name,
          clauseStart,
          column.end,
          clause.end,
        );
      }
    }
  }

  /** Column added or redefined by an ALTER TABLE clause, or null for any other clause. */
  private alteredColumn(start: number, end: number): Identifier | null {
    const m = this.masked;
    const add = keywordsAt(m, start, end, 'ADD');
    if (add !== null) {
      let i = skipSpace(m, add, end);
      const explicit = keywordsAt(m, i, end, 'COLUMN');
      if (explicit !== null) {
        i = skipSpace(m, explicit, end);
      }
      i = optionalKeywords(m, i, end, 'IF', 'NOT', 'EXISTS');
      if (m[i] === '(') {
        if (explicit !== null) {
          this.problems.push(
            `línea ${this.lineOf(start)}: la forma ADD COLUMN (...) con varias columnas no está soportada; usa un ADD COLUMN por columna.`,
          );
        }
        return null;
      }
      const column = readIdentifier(this.sql, m, i, end);
      if (!column) {
        return null;
      }
      if (
        explicit === null &&
        !column.quoted &&
        ALTER_ADD_NON_COLUMN.has(column.name.toUpperCase())
      ) {
        return null;
      }
      return column;
    }
    const modify = keywordsAt(m, start, end, 'MODIFY');
    if (modify !== null) {
      let i = optionalKeywords(m, skipSpace(m, modify, end), end, 'COLUMN');
      i = optionalKeywords(m, i, end, 'IF', 'EXISTS');
      return readIdentifier(this.sql, m, i, end);
    }
    const change = keywordsAt(m, start, end, 'CHANGE');
    if (change !== null) {
      let i = optionalKeywords(m, skipSpace(m, change, end), end, 'COLUMN');
      i = optionalKeywords(m, i, end, 'IF', 'EXISTS');
      const previous = readIdentifier(this.sql, m, i, end);
      return previous
        ? readIdentifier(this.sql, m, skipSpace(m, previous.end, end), end)
        : null;
    }
    return null;
  }

  private commentColumn(
    model: SchemaModel,
    columnName: string,
    definitionStart: number,
    nameEnd: number,
    definitionEnd: number,
  ): void {
    const m = this.masked;
    if (
      findTopLevelKeyword(m, nameEnd, definitionEnd, COMMENT_KEYWORD) !== null
    ) {
      this.alreadyCommented++;
      return;
    }
    const line = this.lineOf(definitionStart);
    const where = `línea ${line}: la columna \`${model.tableName}\`.\`${columnName}\``;
    const column = model.columns.find((c) => c.columnName === columnName);
    if (!column) {
      this.problems.push(`${where} no existe en el modelo ${model.name}.`);
      return;
    }
    if (!column.documentation) {
      this.problems.push(
        `${where} (${model.name}.${column.fieldName}) no tiene documentación ///.`,
      );
      return;
    }
    if (column.documentation.length > COLUMN_COMMENT_MAX_LENGTH) {
      this.problems.push(
        `${where} (${model.name}.${column.fieldName}): la documentación tiene ${column.documentation.length} caracteres y MariaDB admite ${COLUMN_COMMENT_MAX_LENGTH}.`,
      );
      return;
    }
    const tail = findTopLevelKeyword(
      m,
      nameEnd,
      definitionEnd,
      COLUMN_TAIL_KEYWORDS,
    );
    this.edits.push({
      position: trimEnd(m, nameEnd, tail ?? definitionEnd),
      text: ` COMMENT '${escapeSqlString(column.documentation)}'`,
    });
    this.added.push({ table: model.tableName, column: columnName, line });
  }

  private commentTable(
    model: SchemaModel,
    statementStart: number,
    optionsStart: number,
    end: number,
  ): void {
    const m = this.masked;
    if (findTopLevelKeyword(m, optionsStart, end, COMMENT_KEYWORD) !== null) {
      this.alreadyCommented++;
      return;
    }
    const line = this.lineOf(statementStart);
    const where = `línea ${line}: la tabla \`${model.tableName}\` (modelo ${model.name})`;
    if (!model.documentation) {
      this.problems.push(`${where} no tiene documentación ///.`);
      return;
    }
    if (model.documentation.length > TABLE_COMMENT_MAX_LENGTH) {
      this.problems.push(
        `${where}: la documentación tiene ${model.documentation.length} caracteres y MariaDB admite ${TABLE_COMMENT_MAX_LENGTH}.`,
      );
      return;
    }
    const tail = findTopLevelKeyword(m, optionsStart, end, TABLE_TAIL_KEYWORDS);
    this.edits.push({
      position: trimEnd(m, optionsStart, tail ?? end),
      text: ` COMMENT='${escapeSqlString(model.documentation)}'`,
    });
    this.added.push({ table: model.tableName, column: null, line });
  }
}

// ---------------------------------------------------------------------------
// CHECK constraints, for the data dictionary (prisma/sql/constraints.sql).

export interface CheckConstraint {
  table: string;
  name: string | null;
  expression: string;
  /** The `--` comment written right above the constraint, if any. */
  description: string | null;
}

/** Reads `ALTER TABLE t ADD [CONSTRAINT name] CHECK (...)` clauses. */
export function extractCheckConstraints(sql: string): CheckConstraint[] {
  const masked = maskSql(sql);
  const checks: CheckConstraint[] = [];
  for (const statement of splitStatements(masked)) {
    const start = skipSpace(masked, statement.start, statement.end);
    const afterAlter = keywordsAt(
      masked,
      start,
      statement.end,
      'ALTER',
      'TABLE',
    );
    if (afterAlter === null) {
      continue;
    }
    const table = readIdentifier(
      sql,
      masked,
      skipSpace(masked, afterAlter, statement.end),
      statement.end,
    );
    if (!table) {
      continue;
    }
    const found: CheckConstraint[] = [];
    for (const clause of splitTopLevel(masked, table.end, statement.end)) {
      const check = readCheck(sql, masked, table.name, clause);
      if (check) {
        found.push(check);
      }
    }
    // A comment above the ALTER TABLE describes the constraint when the statement adds only one.
    if (found.length === 1 && !found[0].description) {
      found[0].description = commentAbove(sql, statement.start, start);
    }
    checks.push(...found);
  }
  return checks;
}

function readCheck(
  sql: string,
  masked: string,
  table: string,
  clause: Range,
): CheckConstraint | null {
  const start = skipSpace(masked, clause.start, clause.end);
  const add = keywordsAt(masked, start, clause.end, 'ADD');
  if (add === null) {
    return null;
  }
  let i = skipSpace(masked, add, clause.end);
  let name: string | null = null;
  const constraint = keywordsAt(masked, i, clause.end, 'CONSTRAINT');
  if (constraint !== null) {
    const identifier = readIdentifier(
      sql,
      masked,
      skipSpace(masked, constraint, clause.end),
      clause.end,
    );
    if (!identifier) {
      return null;
    }
    name = identifier.name;
    i = skipSpace(masked, identifier.end, clause.end);
  }
  const check = keywordsAt(masked, i, clause.end, 'CHECK');
  if (check === null) {
    return null;
  }
  const open = skipSpace(masked, check, clause.end);
  const close =
    masked[open] === '(' ? closingParen(masked, open, clause.end) : -1;
  if (close === -1) {
    return null;
  }
  return {
    table,
    name,
    expression: withoutComments(sql, masked, open + 1, close),
    description: commentAbove(sql, clause.start, start),
  };
}

/** Original text with the comments removed and the whitespace collapsed. */
function withoutComments(
  sql: string,
  masked: string,
  start: number,
  end: number,
): string {
  let text = '';
  for (let i = start; i < end; i++) {
    text += masked[i] === ' ' && !/\s/.test(sql[i]) ? ' ' : sql[i];
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** The block of `--` lines that ends right before `position`, with no blank line in between. */
function commentAbove(
  sql: string,
  from: number,
  position: number,
): string | null {
  const lines = sql.slice(from, position).split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  const block: string[] = [];
  for (let k = lines.length - 1; k >= 0; k--) {
    const line = lines[k].trim();
    if (!line.startsWith('--')) {
      break;
    }
    block.unshift(line.replace(/^--\s?/, '').trim());
  }
  const text = block.join(' ').trim();
  return text.length > 0 ? text : null;
}
