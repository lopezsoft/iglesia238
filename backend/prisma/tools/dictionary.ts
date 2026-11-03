import type { CheckConstraint } from './sql-comments.js';
import type { SchemaDocs, SchemaModel, SchemaRelation } from './schema-docs.js';

// Data dictionary built from the schema documentation: the same structure feeds the Markdown document
// and the JSON export (for a future HTML viewer).

export type ColumnKey = 'PK' | 'FK' | 'UK';

export interface DictionaryColumn {
  name: string;
  field: string;
  type: string;
  prismaType: string;
  /** Enum name when the column is an ENUM. */
  enum: string | null;
  nullable: boolean;
  default: string | null;
  keys: ColumnKey[];
  description: string | null;
}

export interface DictionaryForeignKey {
  field: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete: string | null;
  onUpdate: string | null;
  /** Rows of the referenced table per row of this one: exactly one, or zero or one when the FK admits NULL. */
  parentCardinality: 'one' | 'zero-or-one';
  /** Rows of this table per referenced row: many, or zero or one (one-to-one relation). */
  childCardinality: 'many' | 'zero-or-one';
  /** The foreign key is part of the primary key (identifying relation). */
  identifying: boolean;
}

export interface DictionaryReference {
  table: string;
  columns: string[];
}

export interface DictionaryIndex {
  name: string | null;
  columns: string[];
}

export interface DictionaryTable {
  name: string;
  model: string;
  context: string;
  description: string | null;
  primaryKey: string[];
  columns: DictionaryColumn[];
  uniques: DictionaryIndex[];
  indexes: DictionaryIndex[];
  foreignKeys: DictionaryForeignKey[];
  referencedBy: DictionaryReference[];
  checks: CheckConstraint[];
}

export interface DictionaryEnumValue {
  name: string;
  description: string | null;
}

export interface DictionaryEnum {
  name: string;
  dbName: string;
  context: string;
  description: string | null;
  values: DictionaryEnumValue[];
  usedBy: { table: string; column: string }[];
}

export interface DictionaryContext {
  name: string;
  file: string;
  title: string;
  description: string | null;
  tables: DictionaryTable[];
  enums: DictionaryEnum[];
  /** Mermaid `erDiagram` source. */
  erDiagram: string;
}

export interface DictionarySummary {
  contexts: number;
  tables: number;
  columns: number;
  enums: number;
  checks: number;
  undocumentedTables: number;
  undocumentedColumns: number;
}

export interface DataDictionary {
  title: string;
  /** Generation stamp, `YYYY-MM-DD-HHmm`. */
  stamp: string;
  source: string;
  summary: DictionarySummary;
  contexts: DictionaryContext[];
}

export interface DictionaryOptions {
  stamp: string;
  checks?: CheckConstraint[];
}

export function buildDataDictionary(
  docs: SchemaDocs,
  options: DictionaryOptions,
): DataDictionary {
  const checks = options.checks ?? [];
  const referencedBy = new Map<string, DictionaryReference[]>();
  for (const model of docs.models) {
    for (const relation of model.relations) {
      const list = referencedBy.get(relation.targetTable) ?? [];
      list.push({ table: model.tableName, columns: relation.columns });
      referencedBy.set(relation.targetTable, list);
    }
  }

  const tables = docs.models.map((model) =>
    buildTable(model, referencedBy.get(model.tableName) ?? [], checks),
  );
  const enums: DictionaryEnum[] = docs.enums.map((schemaEnum) => ({
    name: schemaEnum.name,
    dbName: schemaEnum.dbName,
    context: schemaEnum.context,
    description: schemaEnum.documentation,
    values: schemaEnum.values.map((value) => ({
      name: value.dbName,
      description: value.documentation,
    })),
    usedBy: tables.flatMap((table) =>
      table.columns
        .filter((column) => column.enum === schemaEnum.name)
        .map((column) => ({ table: table.name, column: column.name })),
    ),
  }));

  const contexts = docs.contexts.map((context) => {
    const contextTables = tables.filter(
      (table) => table.context === context.name,
    );
    return {
      name: context.name,
      file: context.file,
      title: context.title,
      description: context.description,
      tables: contextTables,
      enums: enums.filter((e) => e.context === context.name),
      erDiagram: renderErDiagram(contextTables),
    };
  });

  const columns = tables.flatMap((table) => table.columns);
  return {
    title: 'Modelo de datos',
    stamp: options.stamp,
    source: 'backend/prisma/schema/*.prisma',
    summary: {
      contexts: contexts.length,
      tables: tables.length,
      columns: columns.length,
      enums: enums.length,
      checks: checks.length,
      undocumentedTables: tables.filter((table) => !table.description).length,
      undocumentedColumns: columns.filter((column) => !column.description)
        .length,
    },
    contexts,
  };
}

function buildTable(
  model: SchemaModel,
  referencedBy: DictionaryReference[],
  checks: CheckConstraint[],
): DictionaryTable {
  const singleUniques = new Set(
    model.uniques
      .filter((u) => u.columns.length === 1)
      .map((u) => u.columns[0]),
  );
  const primaryKey = new Set(model.primaryKey);
  return {
    name: model.tableName,
    model: model.name,
    context: model.context,
    description: model.documentation,
    primaryKey: model.primaryKey,
    columns: model.columns.map((column) => {
      const keys: ColumnKey[] = [];
      if (primaryKey.has(column.columnName)) keys.push('PK');
      if (column.isForeignKey) keys.push('FK');
      if (singleUniques.has(column.columnName)) keys.push('UK');
      return {
        name: column.columnName,
        field: column.fieldName,
        type: column.sqlType,
        prismaType: column.prismaType,
        enum: column.kind === 'enum' ? column.prismaType : null,
        nullable: column.isOptional,
        default: column.isUpdatedAt ? '@updatedAt' : column.default,
        keys,
        description: column.documentation,
      };
    }),
    uniques: model.uniques.map((u) => ({ name: u.name, columns: u.columns })),
    indexes: model.indexes.map((i) => ({ name: i.name, columns: i.columns })),
    foreignKeys: model.relations.map((relation) =>
      toForeignKey(model, relation),
    ),
    referencedBy,
    checks: checks.filter((check) => check.table === model.tableName),
  };
}

function toForeignKey(
  model: SchemaModel,
  relation: SchemaRelation,
): DictionaryForeignKey {
  const primaryKey = new Set(model.primaryKey);
  return {
    field: relation.fieldName,
    columns: relation.columns,
    referencedTable: relation.targetTable,
    referencedColumns: relation.referencedColumns,
    onDelete: relation.onDelete,
    onUpdate: relation.onUpdate,
    parentCardinality: relation.isOptional ? 'zero-or-one' : 'one',
    childCardinality: relation.inverse === 'single' ? 'zero-or-one' : 'many',
    identifying: relation.columns.some((column) => primaryKey.has(column)),
  };
}

// ---------------------------------------------------------------------------
// Mermaid

function mermaidWord(text: string): string {
  return text.replace(/[^\w]/g, '_');
}

/** ER diagram of the context: its tables, plus the tables of other contexts they reference (no attributes). */
export function renderErDiagram(tables: DictionaryTable[]): string {
  const lines = ['erDiagram'];
  for (const table of tables) {
    lines.push(`  ${mermaidWord(table.name)} {`);
    for (const column of table.columns) {
      const type = mermaidWord(column.enum ?? column.prismaType);
      const keys = column.keys.length > 0 ? ` ${column.keys.join(', ')}` : '';
      lines.push(`    ${type} ${mermaidWord(column.name)}${keys}`);
    }
    lines.push('  }');
  }
  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      const parent = fk.parentCardinality === 'one' ? '||' : '|o';
      const child = fk.childCardinality === 'many' ? 'o{' : 'o|';
      const line = fk.identifying ? '--' : '..';
      const label = fk.columns.join(', ').replace(/"/g, "'");
      lines.push(
        `  ${mermaidWord(fk.referencedTable)} ${parent}${line}${child} ${mermaidWord(table.name)} : "${label}"`,
      );
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Markdown

const UNDOCUMENTED = '_Sin documentar_';

function tableAnchor(table: string): string {
  return `tabla-${table.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function enumAnchor(name: string): string {
  return `enum-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function contextAnchor(name: string): string {
  return `contexto-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Escapes text for a table cell: pipes always, and `<` `>` outside code spans so they are not read as HTML. */
export function escapeCell(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, index) =>
      index % 2 === 1
        ? part.replace(/\|/g, '\\|')
        : part
            .replace(/\|/g, '\\|')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;'),
    )
    .join('')
    .replace(/\r?\n/g, ' ');
}

function code(text: string): string {
  const escaped = text.replace(/\|/g, '\\|');
  // A code span that contains backticks needs a longer delimiter.
  return escaped.includes('`') ? `\`\` ${escaped} \`\`` : `\`${escaped}\``;
}

function columnList(columns: string[]): string {
  return columns.map(code).join(', ');
}

function stampToReadable(stamp: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})$/.exec(stamp);
  return match ? `${match[1]} ${match[2]}:${match[3]}` : stamp;
}

export function renderMarkdown(dictionary: DataDictionary): string {
  const out: string[] = [];
  const { summary } = dictionary;
  out.push(`# ${dictionary.title}`, '');
  out.push(
    `> Generado con \`npm run db:dictionary\` el ${stampToReadable(dictionary.stamp)} a partir de \`${dictionary.source}\`.`,
    '> No se edita a mano: la fuente es la documentación `///` del esquema Prisma, que también llega a la base',
    '> de datos como COMMENT de tablas y columnas (`npm run db:comments:inject`).',
    '',
  );

  out.push('## Resumen', '');
  out.push(
    `${summary.tables} tablas, ${summary.columns} columnas, ${summary.enums} enumeraciones y ${summary.checks} reglas CHECK en ${summary.contexts} contextos.`,
  );
  if (summary.undocumentedTables > 0 || summary.undocumentedColumns > 0) {
    out.push(
      '',
      `**Pendiente:** ${summary.undocumentedTables} tablas y ${summary.undocumentedColumns} columnas sin documentación (marcadas como ${UNDOCUMENTED}).`,
    );
  }
  out.push('');
  out.push('| Contexto | Archivo | Tablas | Enumeraciones | Sin documentar |');
  out.push('| --- | --- | ---: | ---: | ---: |');
  for (const context of dictionary.contexts) {
    const missing =
      context.tables.filter((t) => !t.description).length +
      context.tables.flatMap((t) => t.columns).filter((c) => !c.description)
        .length;
    out.push(
      `| [${escapeCell(context.title)}](#${contextAnchor(context.name)}) | ${code(context.file)} | ${context.tables.length} | ${context.enums.length} | ${missing} |`,
    );
  }
  out.push('');

  out.push('## Índice por contexto', '');
  for (const context of dictionary.contexts) {
    out.push(
      `- **[${escapeCell(context.title)}](#${contextAnchor(context.name)})** (${code(context.file)})`,
    );
    for (const table of context.tables) {
      const description = table.description
        ? ` — ${escapeCell(firstSentence(table.description))}`
        : '';
      out.push(
        `  - [${code(table.name)}](#${tableAnchor(table.name)})${description}`,
      );
    }
  }
  out.push('');

  out.push('## Convenciones', '');
  out.push(
    '- **Clave:** PK = clave primaria, FK = clave foránea, UK = única por sí sola (los índices únicos compuestos se listan en cada tabla).',
    '- **Nulo:** «Sí» si la columna admite NULL.',
    '- **Default:** expresión del esquema Prisma; `@updatedAt` lo asigna Prisma en cada actualización.',
    '- **Diagramas:** `||` exactamente uno, `|o` cero o uno, `o{` cero o muchos. Línea continua: la FK es parte de la PK (relación identificadora); punteada: no lo es. Las tablas de otros contextos aparecen sin atributos.',
    '',
  );

  for (const context of dictionary.contexts) {
    renderContext(out, context);
  }
  return `${out.join('\n').trimEnd()}\n`;
}

function firstSentence(text: string): string {
  // A sentence ends before an uppercase letter, so abbreviations such as "p. ej." do not cut it.
  const match = /^.*?[.!?](?=\s+[A-ZÁÉÍÓÚÑ¿¡]|$)/.exec(text);
  return match ? match[0] : text;
}

function renderContext(out: string[], context: DictionaryContext): void {
  out.push(`<a id="${contextAnchor(context.name)}"></a>`, '');
  out.push(`## ${context.title}`, '');
  out.push(`Archivo: ${code(`prisma/schema/${context.file}`)}`, '');
  if (context.description) {
    out.push(escapeCell(context.description), '');
  }
  if (context.tables.length > 0) {
    out.push('### Diagrama entidad-relación', '');
    out.push('```mermaid', context.erDiagram, '```', '');
  }
  for (const table of context.tables) {
    renderTable(out, table);
  }
  if (context.enums.length > 0) {
    out.push(`### Enumeraciones de ${context.title}`, '');
    for (const dictionaryEnum of context.enums) {
      renderEnum(out, dictionaryEnum);
    }
  }
}

function renderTable(out: string[], table: DictionaryTable): void {
  out.push(`<a id="${tableAnchor(table.name)}"></a>`, '');
  out.push(`### ${code(table.name)}`, '');
  out.push(`**Modelo Prisma:** ${code(table.model)}`, '');
  out.push(
    table.description ? escapeCell(table.description) : UNDOCUMENTED,
    '',
  );
  out.push('| Columna | Tipo | Nulo | Default | Clave | Descripción |');
  out.push('| --- | --- | :---: | --- | :---: | --- |');
  for (const column of table.columns) {
    const type = column.enum
      ? `${code('ENUM')} [${column.enum}](#${enumAnchor(column.enum)})`
      : code(column.type);
    out.push(
      [
        '',
        code(column.name),
        type,
        column.nullable ? 'Sí' : 'No',
        column.default !== null ? code(column.default) : '',
        column.keys.join(', '),
        column.description ? escapeCell(column.description) : UNDOCUMENTED,
        '',
      ]
        .join(' | ')
        .trim(),
    );
  }
  out.push('');

  const constraints: string[] = [];
  if (table.primaryKey.length > 0) {
    constraints.push(`- **PK:** (${columnList(table.primaryKey)})`);
  }
  for (const unique of table.uniques.filter((u) => u.columns.length > 1)) {
    constraints.push(
      `- **Única${unique.name ? ` ${code(unique.name)}` : ''}:** (${columnList(unique.columns)})`,
    );
  }
  for (const index of table.indexes) {
    constraints.push(
      `- **Índice${index.name ? ` ${code(index.name)}` : ''}:** (${columnList(index.columns)})`,
    );
  }
  for (const check of table.checks) {
    const name = check.name ? ` ${code(check.name)}` : '';
    const description = check.description
      ? ` — ${escapeCell(check.description)}`
      : '';
    constraints.push(
      `- **CHECK${name}:** ${code(check.expression.replace(/`/g, ''))}${description}`,
    );
  }
  if (constraints.length > 0) {
    out.push('**Restricciones e índices**', '', ...constraints, '');
  }

  if (table.foreignKeys.length > 0) {
    out.push('**Referencia a**', '');
    for (const fk of table.foreignKeys) {
      const actions = [
        fk.onDelete ? `ON DELETE ${fk.onDelete.toUpperCase()}` : null,
        fk.onUpdate ? `ON UPDATE ${fk.onUpdate.toUpperCase()}` : null,
      ].filter(Boolean);
      out.push(
        `- (${columnList(fk.columns)}) → [${code(fk.referencedTable)}](#${tableAnchor(fk.referencedTable)}) (${columnList(fk.referencedColumns)})${actions.length > 0 ? ` — ${actions.join(', ')}` : ''}`,
      );
    }
    out.push('');
  }
  if (table.referencedBy.length > 0) {
    out.push('**Referenciada por**', '');
    for (const reference of table.referencedBy) {
      out.push(
        `- [${code(reference.table)}](#${tableAnchor(reference.table)}) (${columnList(reference.columns)})`,
      );
    }
    out.push('');
  }
}

function renderEnum(out: string[], dictionaryEnum: DictionaryEnum): void {
  out.push(`<a id="${enumAnchor(dictionaryEnum.name)}"></a>`, '');
  out.push(`#### ${code(dictionaryEnum.name)}`, '');
  if (dictionaryEnum.description) {
    out.push(escapeCell(dictionaryEnum.description), '');
  }
  out.push('| Valor | Descripción |', '| --- | --- |');
  for (const value of dictionaryEnum.values) {
    out.push(
      `| ${code(value.name)} | ${value.description ? escapeCell(value.description) : ''} |`,
    );
  }
  out.push('');
  if (dictionaryEnum.usedBy.length > 0) {
    out.push(
      `Usada por: ${dictionaryEnum.usedBy
        .map(
          (use) =>
            `[${code(use.table)}](#${tableAnchor(use.table)}).${code(use.column)}`,
        )
        .join(', ')}`,
      '',
    );
  }
}
