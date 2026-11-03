import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

// Reads the multi-file Prisma schema and returns what the database documentation needs: tables, columns,
// keys, relations and the `///` comments. Prisma does not emit COMMENT clauses for MySQL/MariaDB, so these
// comments are the single source of truth for the data dictionary and for the comments in the database.

export interface SchemaFile {
  /** File name, such as `organization.prisma`. */
  name: string;
  content: string;
}

export type ColumnKind = 'scalar' | 'enum' | 'unsupported';

export interface SchemaColumn {
  fieldName: string;
  columnName: string;
  /** Prisma type without modifiers: `String`, `Int`, `RoleScope`... */
  prismaType: string;
  kind: ColumnKind;
  /** Native type attribute without `@db.`, such as `VarChar(191)`. */
  nativeType: string | null;
  /** Column type as MariaDB stores it, such as `VARCHAR(191)` or `ENUM('A', 'B')`. */
  sqlType: string;
  isOptional: boolean;
  isList: boolean;
  isId: boolean;
  isUnique: boolean;
  isForeignKey: boolean;
  isUpdatedAt: boolean;
  isIgnored: boolean;
  /** Raw `@default(...)` expression, such as `autoincrement()`, `now()` or `"text"`. */
  default: string | null;
  documentation: string | null;
  line: number;
}

/** Shape of the field on the other side of a relation. */
export type RelationInverse = 'list' | 'single' | 'none';

export interface SchemaRelation {
  fieldName: string;
  relationName: string | null;
  targetModel: string;
  targetTable: string;
  fields: string[];
  columns: string[];
  references: string[];
  referencedColumns: string[];
  /** The relation field is optional, so the foreign key admits NULL. */
  isOptional: boolean;
  onDelete: string | null;
  onUpdate: string | null;
  inverse: RelationInverse;
  line: number;
}

/** Relation field without `fields`: the foreign key lives in the other model. It is not a column. */
export interface SchemaBackRelation {
  fieldName: string;
  relationName: string | null;
  targetModel: string;
  isList: boolean;
  isOptional: boolean;
}

export interface SchemaIndex {
  fields: string[];
  columns: string[];
  /** Value of `map:` or `name:`, when the schema sets one. */
  name: string | null;
}

export interface SchemaModel {
  name: string;
  tableName: string;
  documentation: string | null;
  /** Schema file name without extension: `organization`, `identity`... */
  context: string;
  file: string;
  line: number;
  columns: SchemaColumn[];
  relations: SchemaRelation[];
  backRelations: SchemaBackRelation[];
  /** Primary key column names, from `@id` or `@@id`. */
  primaryKey: string[];
  uniques: SchemaIndex[];
  indexes: SchemaIndex[];
}

export interface SchemaEnumValue {
  name: string;
  dbName: string;
  documentation: string | null;
}

export interface SchemaEnum {
  name: string;
  dbName: string;
  documentation: string | null;
  context: string;
  file: string;
  line: number;
  values: SchemaEnumValue[];
}

export interface SchemaContext {
  name: string;
  file: string;
  /** Title from the file header (`// Organización: ...`), or the context name. */
  title: string;
  description: string | null;
}

export interface SchemaDocs {
  contexts: SchemaContext[];
  models: SchemaModel[];
  enums: SchemaEnum[];
}

export class SchemaParseError extends Error {
  constructor(
    readonly file: string,
    readonly line: number,
    detail: string,
  ) {
    super(`${file}:${line}: ${detail}`);
    this.name = 'SchemaParseError';
  }
}

/** Display order of the business contexts; any other schema file goes after them, alphabetically. */
export const CONTEXT_ORDER = [
  'organization',
  'identity',
  'membership',
  'secretariat',
  'ministries',
  'accounting',
];

const SCALAR_TYPES = new Set([
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes',
]);

/** Types Prisma emits for MySQL/MariaDB when the field has no native type attribute. */
const DEFAULT_SQL_TYPES: Record<string, string> = {
  String: 'VARCHAR(191)',
  Boolean: 'BOOLEAN',
  Int: 'INTEGER',
  BigInt: 'BIGINT',
  Float: 'DOUBLE',
  Decimal: 'DECIMAL(65, 30)',
  DateTime: 'DATETIME(3)',
  Json: 'JSON',
  Bytes: 'LONGBLOB',
};

const FIELD_PATTERN =
  /^(\w+)\s+(Unsupported\("(?:[^"\\]|\\.)*"\)|[A-Za-z_]\w*)(\[\])?(\?)?(?:\s+([\s\S]*))?$/;
const BLOCK_START_PATTERN =
  /^(model|enum|view|type|generator|datasource)\s+(\w+)\s*\{\s*$/;

/** Joins `///` lines into one sentence: each line trimmed, empty lines dropped, separated by a space. */
export function normalizeDocumentation(lines: string[]): string | null {
  const text = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 0 ? text : null;
}

export function loadSchemaFiles(schemaDir: string): SchemaFile[] {
  return readdirSync(schemaDir)
    .filter((name) => name.endsWith('.prisma'))
    .sort()
    .map((name) => ({
      name,
      content: readFileSync(join(schemaDir, name), 'utf8'),
    }));
}

export function loadSchemaDocs(schemaDir: string): SchemaDocs {
  return parseSchema(loadSchemaFiles(schemaDir));
}

export function parseSchema(files: SchemaFile[]): SchemaDocs {
  const lexed = files.map(lexFile);
  const blocks = lexed.flatMap((file) => file.blocks);
  const modelNames = new Set(
    blocks.filter((b) => b.kind === 'model').map((b) => b.name),
  );
  const enumBlocks = blocks.filter((b) => b.kind === 'enum');
  const enums = enumBlocks.map(buildEnum);
  const enumsByName = new Map(enums.map((e) => [e.name, e]));

  const parsed = blocks
    .filter((b) => b.kind === 'model')
    .map((block) => buildModel(block, modelNames, enumsByName));
  resolveRelations(parsed);
  const models = parsed.map(({ model }) => model);

  const contexts = lexed
    .filter((file) =>
      file.blocks.some((b) => b.kind === 'model' || b.kind === 'enum'),
    )
    .map((file) => buildContext(file))
    .sort((a, b) => compareContexts(a.name, b.name));

  return { contexts, models, enums };
}

export function compareContexts(a: string, b: string): number {
  const rank = (name: string): number => {
    const index = CONTEXT_ORDER.indexOf(name);
    return index === -1 ? CONTEXT_ORDER.length : index;
  };
  return rank(a) - rank(b) || a.localeCompare(b);
}

// ---------------------------------------------------------------------------
// Lexing: blocks with their entries and the `///` lines that precede each one.

interface RawEntry {
  text: string;
  docs: string[];
  line: number;
}

interface RawBlock {
  kind: string;
  name: string;
  docs: string[];
  line: number;
  file: string;
  context: string;
  entries: RawEntry[];
}

interface LexedFile {
  file: string;
  context: string;
  header: string[];
  blocks: RawBlock[];
}

function lexFile(file: SchemaFile): LexedFile {
  const context = basename(file.name, '.prisma');
  const lines = file.content.split(/\r?\n/);
  const blocks: RawBlock[] = [];
  const header: string[] = [];
  let pendingDocs: string[] = [];
  let current: RawBlock | null = null;

  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    const trimmed = raw.trim();

    if (trimmed.startsWith('///')) {
      pendingDocs.push(trimmed.slice(3));
      continue;
    }
    if (current) {
      if (trimmed === '}') {
        blocks.push(current);
        current = null;
        pendingDocs = [];
      } else if (trimmed !== '' && !trimmed.startsWith('//')) {
        current.entries.push({ text: trimmed, docs: pendingDocs, line });
        pendingDocs = [];
      }
      continue;
    }
    const start = BLOCK_START_PATTERN.exec(trimmed);
    if (start) {
      current = {
        kind: start[1],
        name: start[2],
        docs: pendingDocs,
        line,
        file: file.name,
        context,
        entries: [],
      };
      pendingDocs = [];
    } else if (trimmed.startsWith('//')) {
      if (blocks.length === 0) {
        header.push(trimmed.slice(2).trim());
      }
    } else if (trimmed !== '') {
      throw new SchemaParseError(
        file.name,
        line,
        `unexpected line "${trimmed}"`,
      );
    }
  }

  if (current) {
    throw new SchemaParseError(
      file.name,
      current.line,
      `block "${current.name}" is not closed`,
    );
  }
  return { file: file.name, context, header, blocks };
}

function buildContext(file: LexedFile): SchemaContext {
  const lines = file.header.filter((line) => !/^[=\-\s]*$/.test(line));
  if (lines.length === 0) {
    return {
      name: file.context,
      file: file.file,
      title: file.context,
      description: null,
    };
  }
  const [first, ...rest] = lines;
  const colon = first.indexOf(':');
  const title = colon > 0 ? first.slice(0, colon).trim() : first;
  const lead = colon > 0 ? capitalize(first.slice(colon + 1).trim()) : '';
  // The subtitle after the colon reads as a sentence of its own.
  const leadSentence = lead && !/[.:;!?]$/.test(lead) ? `${lead}.` : lead;
  const description = normalizeDocumentation([leadSentence, ...rest]);
  return { name: file.context, file: file.file, title, description };
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

// ---------------------------------------------------------------------------
// Line-level helpers: trailing comments, attributes and their arguments.

interface CodeLine {
  code: string;
  trailingDoc: string | null;
}

/** Removes a trailing `//` comment outside string literals; a trailing `///` is kept as documentation. */
export function stripTrailingComment(text: string): CodeLine {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '/' && text[i + 1] === '/') {
      const isDoc = text[i + 2] === '/';
      return {
        code: text.slice(0, i).trimEnd(),
        trailingDoc: isDoc ? text.slice(i + 3).trim() || null : null,
      };
    }
  }
  return { code: text.trimEnd(), trailingDoc: null };
}

interface Attribute {
  /** Name with its `@` or `@@` prefix: `@map`, `@db.VarChar`, `@@unique`. */
  name: string;
  args: string | null;
}

/** Index of the parenthesis that closes the one at `open`, skipping string literals. */
function closingParen(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

export function parseAttributes(text: string): Attribute[] {
  const attributes: Attribute[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    const match = /^@@?[A-Za-z_][\w.]*/.exec(text.slice(i));
    if (!match) {
      throw new Error(`unexpected text "${text.slice(i)}"`);
    }
    const name = match[0];
    i += name.length;
    let args: string | null = null;
    if (text[i] === '(') {
      const close = closingParen(text, i);
      if (close === -1) {
        throw new Error(`unbalanced parentheses in ${name}`);
      }
      args = text.slice(i + 1, close).trim();
      i = close + 1;
    }
    attributes.push({ name, args });
  }
  return attributes;
}

/** Splits on commas that are outside strings, parentheses and brackets. */
export function splitArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') {
        i++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '(' || char === '[') {
      depth++;
    } else if (char === ')' || char === ']') {
      depth--;
    } else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last.length > 0) {
    parts.push(last);
  }
  return parts;
}

interface Arguments {
  positional: string[];
  named: Record<string, string>;
}

function parseArguments(text: string | null): Arguments {
  const result: Arguments = { positional: [], named: {} };
  for (const part of splitArguments(text ?? '')) {
    const named = /^(\w+)\s*:\s*([\s\S]+)$/.exec(part);
    if (named) {
      result.named[named[1]] = named[2].trim();
    } else {
      result.positional.push(part);
    }
  }
  return result;
}

function parseStringLiteral(text: string | undefined): string | null {
  const match = /^"((?:[^"\\]|\\.)*)"$/.exec(text?.trim() ?? '');
  return match ? match[1].replace(/\\(.)/g, '$1') : null;
}

/** Field names of a list such as `[a, b(sort: Desc)]`. */
function parseFieldList(text: string | undefined): string[] {
  const trimmed = text?.trim() ?? '';
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return [];
  }
  return splitArguments(trimmed.slice(1, -1))
    .map((item) => /^\w+/.exec(item)?.[0])
    .filter((name): name is string => Boolean(name));
}

function nameArgument(args: Arguments): string | null {
  return parseStringLiteral(args.named.name ?? args.positional[0]);
}

// ---------------------------------------------------------------------------
// Enums and models.

function buildEnum(block: RawBlock): SchemaEnum {
  let dbName = block.name;
  const values: SchemaEnumValue[] = [];
  for (const entry of block.entries) {
    const { code, trailingDoc } = stripTrailingComment(entry.text);
    if (code.startsWith('@@')) {
      const map = parseAttributes(code).find((a) => a.name === '@@map');
      dbName = (map && nameArgument(parseArguments(map.args))) ?? dbName;
      continue;
    }
    const match = /^(\w+)\s*([\s\S]*)$/.exec(code);
    if (!match) {
      throw new SchemaParseError(
        block.file,
        entry.line,
        `invalid enum value "${code}"`,
      );
    }
    const attributes = parseAttributesAt(block, entry, match[2]);
    const map = attributes.find((a) => a.name === '@map');
    values.push({
      name: match[1],
      dbName: (map && nameArgument(parseArguments(map.args))) ?? match[1],
      documentation: normalizeDocumentation(
        withTrailing(entry.docs, trailingDoc),
      ),
    });
  }
  return {
    name: block.name,
    dbName,
    documentation: normalizeDocumentation(block.docs),
    context: block.context,
    file: block.file,
    line: block.line,
    values,
  };
}

function withTrailing(docs: string[], trailing: string | null): string[] {
  return trailing ? [...docs, trailing] : docs;
}

function parseAttributesAt(
  block: RawBlock,
  entry: RawEntry,
  text: string,
): Attribute[] {
  try {
    return parseAttributes(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new SchemaParseError(block.file, entry.line, detail);
  }
}

/** Relation as written in the model, before the target model is known. */
type PendingRelation = Omit<
  SchemaRelation,
  'columns' | 'targetTable' | 'referencedColumns' | 'inverse'
>;

interface ParsedModel {
  model: SchemaModel;
  relations: PendingRelation[];
}

function buildModel(
  block: RawBlock,
  modelNames: Set<string>,
  enumsByName: Map<string, SchemaEnum>,
): ParsedModel {
  const model: SchemaModel = {
    name: block.name,
    tableName: block.name,
    documentation: normalizeDocumentation(block.docs),
    context: block.context,
    file: block.file,
    line: block.line,
    columns: [],
    relations: [],
    backRelations: [],
    primaryKey: [],
    uniques: [],
    indexes: [],
  };
  const relations: PendingRelation[] = [];
  const blockAttributes: Attribute[] = [];

  for (const entry of block.entries) {
    const { code, trailingDoc } = stripTrailingComment(entry.text);
    if (code.startsWith('@@')) {
      blockAttributes.push(...parseAttributesAt(block, entry, code));
      continue;
    }
    const match = FIELD_PATTERN.exec(code);
    if (!match) {
      throw new SchemaParseError(
        block.file,
        entry.line,
        `invalid field "${code}"`,
      );
    }
    const [, fieldName, type, list, optional, rest] = match;
    const attributes = parseAttributesAt(block, entry, rest ?? '');
    const isList = list === '[]';
    const isOptional = optional === '?';

    if (modelNames.has(type)) {
      const relation = attributes.find((a) => a.name === '@relation');
      const args = parseArguments(relation?.args ?? null);
      const fields = parseFieldList(args.named.fields);
      const relationName = nameArgument(args);
      if (fields.length > 0) {
        relations.push({
          fieldName,
          relationName,
          targetModel: type,
          fields,
          references: parseFieldList(args.named.references),
          isOptional,
          onDelete: args.named.onDelete ?? null,
          onUpdate: args.named.onUpdate ?? null,
          line: entry.line,
        });
      } else {
        model.backRelations.push({
          fieldName,
          relationName,
          targetModel: type,
          isList,
          isOptional,
        });
      }
      continue;
    }

    if (
      !SCALAR_TYPES.has(type) &&
      !enumsByName.has(type) &&
      !type.startsWith('Unsupported(')
    ) {
      throw new SchemaParseError(
        block.file,
        entry.line,
        `unknown type "${type}"`,
      );
    }
    model.columns.push(
      buildColumn(
        fieldName,
        type,
        isList,
        isOptional,
        attributes,
        enumsByName,
        {
          docs: withTrailing(entry.docs, trailingDoc),
          line: entry.line,
        },
      ),
    );
  }

  const columnOf = fieldToColumn(model);
  for (const attribute of blockAttributes) {
    const args = parseArguments(attribute.args);
    const fields = parseFieldList(args.positional[0] ?? args.named.fields);
    const index: SchemaIndex = {
      fields,
      columns: fields.map(columnOf),
      name: parseStringLiteral(args.named.map ?? args.named.name),
    };
    if (attribute.name === '@@map') {
      model.tableName = nameArgument(args) ?? model.tableName;
    } else if (attribute.name === '@@id') {
      model.primaryKey = index.columns;
    } else if (attribute.name === '@@unique') {
      model.uniques.push(index);
    } else if (attribute.name === '@@index') {
      model.indexes.push(index);
    }
  }
  for (const column of model.columns) {
    if (column.isId) {
      model.primaryKey = [column.columnName];
    }
    if (column.isUnique) {
      model.uniques.push({
        fields: [column.fieldName],
        columns: [column.columnName],
        name: null,
      });
    }
  }
  const foreignKeyFields = new Set(relations.flatMap((r) => r.fields));
  for (const column of model.columns) {
    column.isForeignKey = foreignKeyFields.has(column.fieldName);
  }
  return { model, relations };
}

function buildColumn(
  fieldName: string,
  type: string,
  isList: boolean,
  isOptional: boolean,
  attributes: Attribute[],
  enumsByName: Map<string, SchemaEnum>,
  source: { docs: string[]; line: number },
): SchemaColumn {
  const find = (name: string) => attributes.find((a) => a.name === name);
  const native = attributes.find((a) => a.name.startsWith('@db.'));
  const nativeType = native
    ? `${native.name.slice(4)}${native.args !== null ? `(${native.args})` : ''}`
    : null;
  const defaultAttribute = find('@default');
  const map = find('@map');
  const enumType = enumsByName.get(type);
  const kind: ColumnKind = type.startsWith('Unsupported(')
    ? 'unsupported'
    : enumType
      ? 'enum'
      : 'scalar';
  return {
    fieldName,
    columnName: (map && nameArgument(parseArguments(map.args))) ?? fieldName,
    prismaType: type,
    kind,
    nativeType,
    sqlType: toSqlType(type, nativeType, enumType),
    isOptional,
    isList,
    isId: find('@id') !== undefined,
    isUnique: find('@unique') !== undefined,
    isForeignKey: false,
    isUpdatedAt: find('@updatedAt') !== undefined,
    isIgnored: find('@ignore') !== undefined,
    default: defaultAttribute
      ? (parseArguments(defaultAttribute.args).positional[0] ?? null)
      : null,
    documentation: normalizeDocumentation(source.docs),
    line: source.line,
  };
}

/** MariaDB column type, written the way Prisma writes it in migrations. */
export function toSqlType(
  prismaType: string,
  nativeType: string | null,
  enumType?: SchemaEnum,
): string {
  if (enumType) {
    return `ENUM(${enumType.values.map((v) => `'${v.dbName}'`).join(', ')})`;
  }
  const unsupported = /^Unsupported\("((?:[^"\\]|\\.)*)"\)$/.exec(prismaType);
  if (unsupported) {
    return unsupported[1].toUpperCase();
  }
  if (!nativeType) {
    return DEFAULT_SQL_TYPES[prismaType] ?? prismaType.toUpperCase();
  }
  const match = /^(\w+)(?:\(([\s\S]*)\))?$/.exec(nativeType);
  const name = match?.[1] ?? nativeType;
  const args = match?.[2]
    ?.split(',')
    .map((arg) => arg.trim())
    .join(', ');
  const unsigned = /^Unsigned(\w+)$/.exec(name);
  const base = (unsigned ? unsigned[1] : name).toUpperCase();
  return `${base}${args !== undefined ? `(${args})` : ''}${unsigned ? ' UNSIGNED' : ''}`;
}

function fieldToColumn(model: SchemaModel): (field: string) => string {
  const columns = new Map(
    model.columns.map((c) => [c.fieldName, c.columnName]),
  );
  return (field) => columns.get(field) ?? field;
}

function resolveRelations(parsed: ParsedModel[]): void {
  const byName = new Map(parsed.map(({ model }) => [model.name, model]));
  for (const { model, relations } of parsed) {
    const columnOf = fieldToColumn(model);
    for (const relation of relations) {
      const target = byName.get(relation.targetModel);
      if (!target) {
        throw new SchemaParseError(
          model.file,
          relation.line,
          `unknown model ${relation.targetModel}`,
        );
      }
      const targetColumnOf = fieldToColumn(target);
      model.relations.push({
        ...relation,
        targetTable: target.tableName,
        columns: relation.fields.map(columnOf),
        referencedColumns: relation.references.map(targetColumnOf),
        inverse: findInverse(target, model.name, relation.relationName),
      });
    }
  }
}

function findInverse(
  target: SchemaModel,
  ownerName: string,
  relationName: string | null,
): RelationInverse {
  const inverse = target.backRelations.find(
    (back) =>
      back.targetModel === ownerName && back.relationName === relationName,
  );
  if (!inverse) {
    return 'none';
  }
  return inverse.isList ? 'list' : 'single';
}
