import { compareWithDatabase, findUndocumented } from './comment-checks.js';
import {
  buildDataDictionary,
  escapeCell,
  renderMarkdown,
} from './dictionary.js';
import { parseSchema } from './schema-docs.js';
import type { SchemaDocs } from './schema-docs.js';

const SCHEMA = `// Organización: sedes
/// País.
model Country {
  /// Identificador.
  id   Int    @id @default(autoincrement())
  /// Código ISO | alfa-2.
  iso  String @unique @db.Char(2)
  regions Region[]

  @@map("countries")
}

model Region {
  id        Int     @id @default(autoincrement())
  /// País <padre>.
  countryId Int?    @map("country_id")
  kind      RegionKind
  country   Country? @relation(fields: [countryId], references: [id], onDelete: Restrict)

  @@unique([countryId, kind])
  @@map("regions")
}

enum RegionKind {
  /// Departamento.
  STATE
  PROVINCE
}
`;

function docs(): SchemaDocs {
  return parseSchema([{ name: 'organization.prisma', content: SCHEMA }]);
}

describe('findUndocumented', () => {
  it('lists the models and columns without /// documentation', () => {
    expect(
      findUndocumented(docs()).map((i) => `${i.model}.${i.field ?? ''}`),
    ).toEqual(['Region.', 'Region.id', 'Region.kind']);
  });
});

describe('compareWithDatabase', () => {
  it('reports missing, empty and different comments', () => {
    const drifts = compareWithDatabase(
      docs(),
      [{ tableName: 'countries', tableComment: 'País.' }],
      [
        { tableName: 'countries', columnName: 'id', columnComment: '' },
        { tableName: 'countries', columnName: 'iso', columnComment: 'Otro.' },
      ],
    );
    expect(drifts.map((d) => `${d.kind} ${d.table}.${d.column ?? ''}`)).toEqual(
      [
        'empty-comment countries.id',
        'different-comment countries.iso',
        'missing-table regions.',
      ],
    );
  });
});

describe('buildDataDictionary', () => {
  const dictionary = buildDataDictionary(docs(), {
    stamp: '2026-11-02-1430',
    checks: [
      {
        table: 'regions',
        name: 'chk_kind',
        expression: '`kind` <> 1',
        description: 'Regla.',
      },
    ],
  });

  it('groups tables and enums by context with keys and cardinalities', () => {
    const [context] = dictionary.contexts;
    expect(context.title).toBe('Organización');
    expect(context.tables.map((t) => t.name)).toEqual(['countries', 'regions']);
    const regions = context.tables[1];
    expect(regions.columns.map((c) => [c.name, c.keys])).toEqual([
      ['id', ['PK']],
      ['country_id', ['FK']],
      ['kind', []],
    ]);
    expect(regions.foreignKeys[0]).toMatchObject({
      referencedTable: 'countries',
      parentCardinality: 'zero-or-one',
      childCardinality: 'many',
      identifying: false,
      onDelete: 'Restrict',
    });
    expect(context.tables[0].referencedBy).toEqual([
      { table: 'regions', columns: ['country_id'] },
    ]);
    expect(context.enums[0].usedBy).toEqual([
      { table: 'regions', column: 'kind' },
    ]);
    expect(dictionary.summary).toMatchObject({
      tables: 2,
      columns: 5,
      undocumentedTables: 1,
      undocumentedColumns: 2,
      checks: 1,
    });
  });

  it('renders a Mermaid ER diagram with PK/FK markers and relationship cardinality', () => {
    expect(dictionary.contexts[0].erDiagram).toBe(
      [
        'erDiagram',
        '  countries {',
        '    Int id PK',
        '    String iso UK',
        '  }',
        '  regions {',
        '    Int id PK',
        '    Int country_id FK',
        '    RegionKind kind',
        '  }',
        '  countries |o..o{ regions : "country_id"',
      ].join('\n'),
    );
  });

  it('renders the Markdown dictionary with index, columns, constraints and enums', () => {
    const markdown = renderMarkdown(dictionary);
    expect(markdown).toContain('# Modelo de datos');
    expect(markdown).toContain('el 2026-11-02 14:30');
    expect(markdown).toContain('- [`countries`](#tabla-countries) — País.');
    expect(markdown).toContain(
      '| `iso` | `CHAR(2)` | No |  | UK | Código ISO \\| alfa-2. |',
    );
    expect(markdown).toContain(
      '| `country_id` | `INTEGER` | Sí |  | FK | País &lt;padre&gt;. |',
    );
    expect(markdown).toContain(
      '| `kind` | `ENUM` [RegionKind](#enum-regionkind) | No |  |  | _Sin documentar_ |',
    );
    expect(markdown).toContain('- **Única:** (`country_id`, `kind`)');
    expect(markdown).toContain('- **CHECK `chk_kind`:** `kind <> 1` — Regla.');
    expect(markdown).toContain(
      '- (`country_id`) → [`countries`](#tabla-countries) (`id`) — ON DELETE RESTRICT',
    );
    expect(markdown).toContain('```mermaid\nerDiagram');
    expect(markdown).toContain('| `STATE` | Departamento. |');
  });
});

describe('escapeCell', () => {
  it('escapes pipes everywhere and angle brackets outside code spans', () => {
    expect(escapeCell('a | <b> `c<d>|e`')).toBe('a \\| &lt;b&gt; `c<d>\\|e`');
  });
});
