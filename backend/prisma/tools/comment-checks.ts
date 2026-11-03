import type { SchemaDocs } from './schema-docs.js';

export interface UndocumentedItem {
  file: string;
  line: number;
  model: string;
  table: string;
  /** Null when the model itself lacks documentation. */
  field: string | null;
  column: string | null;
}

/** Models and columns without `///` documentation, in schema order. */
export function findUndocumented(docs: SchemaDocs): UndocumentedItem[] {
  const items: UndocumentedItem[] = [];
  for (const model of docs.models) {
    if (!model.documentation) {
      items.push({
        file: model.file,
        line: model.line,
        model: model.name,
        table: model.tableName,
        field: null,
        column: null,
      });
    }
    for (const column of model.columns) {
      if (!column.documentation) {
        items.push({
          file: model.file,
          line: column.line,
          model: model.name,
          table: model.tableName,
          field: column.fieldName,
          column: column.columnName,
        });
      }
    }
  }
  return items;
}

export interface DatabaseTableComment {
  tableName: string;
  tableComment: string;
}

export interface DatabaseColumnComment {
  tableName: string;
  columnName: string;
  columnComment: string;
}

export type CommentDriftKind =
  'missing-table' | 'missing-column' | 'empty-comment' | 'different-comment';

export interface CommentDrift {
  kind: CommentDriftKind;
  table: string;
  /** Null for the table comment. */
  column: string | null;
  expected: string;
  actual: string | null;
}

/**
 * Compares the schema documentation with the comments stored in the database (information_schema).
 * Undocumented items are only reported when the database has a comment the schema lacks: the static
 * check already lists them.
 */
export function compareWithDatabase(
  docs: SchemaDocs,
  tables: DatabaseTableComment[],
  columns: DatabaseColumnComment[],
): CommentDrift[] {
  const tableComments = new Map(
    tables.map((t) => [t.tableName, t.tableComment]),
  );
  const columnComments = new Map(
    columns.map((c) => [`${c.tableName}.${c.columnName}`, c.columnComment]),
  );
  const drifts: CommentDrift[] = [];
  const compare = (
    table: string,
    column: string | null,
    expected: string,
    actual: string,
  ): void => {
    if (actual === expected) {
      return;
    }
    drifts.push({
      kind: actual === '' ? 'empty-comment' : 'different-comment',
      table,
      column,
      expected,
      actual,
    });
  };

  for (const model of docs.models) {
    const tableComment = tableComments.get(model.tableName);
    if (tableComment === undefined) {
      drifts.push({
        kind: 'missing-table',
        table: model.tableName,
        column: null,
        expected: model.documentation ?? '',
        actual: null,
      });
      continue;
    }
    compare(model.tableName, null, model.documentation ?? '', tableComment);
    for (const column of model.columns) {
      const columnComment = columnComments.get(
        `${model.tableName}.${column.columnName}`,
      );
      if (columnComment === undefined) {
        drifts.push({
          kind: 'missing-column',
          table: model.tableName,
          column: column.columnName,
          expected: column.documentation ?? '',
          actual: null,
        });
        continue;
      }
      compare(
        model.tableName,
        column.columnName,
        column.documentation ?? '',
        columnComment,
      );
    }
  }
  return drifts;
}
