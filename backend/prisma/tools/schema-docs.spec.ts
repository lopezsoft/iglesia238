import {
  normalizeDocumentation,
  parseSchema,
  SchemaParseError,
  stripTrailingComment,
  toSqlType,
} from './schema-docs.js';
import type { SchemaDocs, SchemaModel } from './schema-docs.js';

const ORGANIZATION = `// ==========================================
// Organización: jerarquía multi-iglesia
// Regla: toda tabla lleva denominationId.
// ==========================================

/// Denominación: unidad de aislamiento.
/// La crea la plataforma.
model Denomination {
  /// Identificador.
  id        Int       @id @default(autoincrement())
  /// Nombre "oficial", único.
  name      String    @unique @db.VarChar(200)
  logoPath  String?   @map("logo_path") @db.VarChar(255) // not documentation
  updatedAt DateTime  @updatedAt @map("updated_at")
  website   String?   @default("http://example.org") /// Sitio web.
  congregations Congregation[]

  @@map("denominations")
}

/// Sede.
model Congregation {
  id             Int          @id @default(autoincrement())
  /// Denominación dueña.
  denominationId Int          @map("denomination_id")
  status         CongregationStatus @default(ACTIVE)
  parentId       Int?         @map("parent_id")
  denomination   Denomination @relation(fields: [denominationId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  parent         Congregation?  @relation("Hierarchy", fields: [denominationId, parentId], references: [denominationId, id])
  children       Congregation[] @relation("Hierarchy")
  profile        CongregationProfile?

  @@unique([denominationId, id])
  @@index([denominationId, status(sort: Desc)], map: "congregations_status_idx")
  @@map("congregations")
}

/// Ficha uno a uno de la sede.
model CongregationProfile {
  congregationId Int          @map("congregation_id")
  year           Int
  amount         Decimal      @db.Decimal(14,2)
  congregation   Congregation @relation(fields: [congregationId], references: [id])

  @@id([congregationId, year])
  @@map("congregation_profiles")
}

/// Estado de una sede.
enum CongregationStatus {
  /// Abierta.
  ACTIVE
  CLOSED @map("closed")
}
`;

const BASE = `// Entry point
generator client {
  provider = "prisma-client"
}

datasource db {
  provider = "mysql"
}
`;

function parse(): SchemaDocs {
  return parseSchema([
    { name: 'base.prisma', content: BASE },
    { name: 'organization.prisma', content: ORGANIZATION },
  ]);
}

function model(docs: SchemaDocs, name: string): SchemaModel {
  const found = docs.models.find((m) => m.name === name);
  if (!found) {
    throw new Error(`model ${name} not found`);
  }
  return found;
}

describe('parseSchema', () => {
  it('reads the model documentation and the table name from @@map', () => {
    const denomination = model(parse(), 'Denomination');
    expect(denomination.tableName).toBe('denominations');
    expect(denomination.documentation).toBe(
      'Denominación: unidad de aislamiento. La crea la plataforma.',
    );
    expect(denomination.context).toBe('organization');
  });

  it('keeps the model name as table name without @@map', () => {
    const docs = parseSchema([
      { name: 'x.prisma', content: 'model Thing {\n  id Int @id\n}\n' },
    ]);
    expect(docs.models[0].tableName).toBe('Thing');
    expect(docs.models[0].documentation).toBeNull();
  });

  it('lists only real columns: relation objects and back-relation lists are excluded', () => {
    const congregation = model(parse(), 'Congregation');
    expect(congregation.columns.map((c) => c.columnName)).toEqual([
      'id',
      'denomination_id',
      'status',
      'parent_id',
    ]);
    expect(congregation.backRelations.map((b) => b.fieldName)).toEqual([
      'children',
      'profile',
    ]);
  });

  it('reads column name, type, optionality, default and documentation', () => {
    const denomination = model(parse(), 'Denomination');
    const [id, name, logoPath, updatedAt, website] = denomination.columns;
    expect(id).toMatchObject({
      isId: true,
      default: 'autoincrement()',
      documentation: 'Identificador.',
    });
    expect(name).toMatchObject({
      columnName: 'name',
      nativeType: 'VarChar(200)',
      sqlType: 'VARCHAR(200)',
      isUnique: true,
      isOptional: false,
      documentation: 'Nombre "oficial", único.',
    });
    expect(logoPath).toMatchObject({
      columnName: 'logo_path',
      isOptional: true,
      documentation: null,
    });
    expect(updatedAt).toMatchObject({
      isUpdatedAt: true,
      sqlType: 'DATETIME(3)',
    });
    expect(website).toMatchObject({
      default: '"http://example.org"',
      documentation: 'Sitio web.',
    });
  });

  it('marks foreign key scalars and resolves relations with their columns and target table', () => {
    const congregation = model(parse(), 'Congregation');
    expect(
      congregation.columns
        .filter((c) => c.isForeignKey)
        .map((c) => c.fieldName),
    ).toEqual(['denominationId', 'parentId']);
    const [denomination, parent] = congregation.relations;
    expect(denomination).toMatchObject({
      fieldName: 'denomination',
      targetTable: 'denominations',
      columns: ['denomination_id'],
      referencedColumns: ['id'],
      isOptional: false,
      onDelete: 'Restrict',
      onUpdate: 'Cascade',
      inverse: 'list',
    });
    expect(parent).toMatchObject({
      relationName: 'Hierarchy',
      targetTable: 'congregations',
      columns: ['denomination_id', 'parent_id'],
      referencedColumns: ['denomination_id', 'id'],
      isOptional: true,
      inverse: 'list',
    });
  });

  it('detects one-to-one relations from a single back-relation field', () => {
    const profile = model(parse(), 'CongregationProfile');
    expect(profile.relations[0].inverse).toBe('single');
  });

  it('reads composite primary keys, uniques and indexes with their column names', () => {
    const docs = parse();
    expect(model(docs, 'CongregationProfile').primaryKey).toEqual([
      'congregation_id',
      'year',
    ]);
    const congregation = model(docs, 'Congregation');
    expect(congregation.primaryKey).toEqual(['id']);
    expect(congregation.uniques).toEqual([
      {
        fields: ['denominationId', 'id'],
        columns: ['denomination_id', 'id'],
        name: null,
      },
    ]);
    expect(congregation.indexes).toEqual([
      {
        fields: ['denominationId', 'status'],
        columns: ['denomination_id', 'status'],
        name: 'congregations_status_idx',
      },
    ]);
    expect(model(docs, 'Denomination').uniques).toEqual([
      { fields: ['name'], columns: ['name'], name: null },
    ]);
  });

  it('reads enums with their documented values and types enum columns', () => {
    const docs = parse();
    expect(docs.enums).toEqual([
      expect.objectContaining({
        name: 'CongregationStatus',
        documentation: 'Estado de una sede.',
        values: [
          { name: 'ACTIVE', dbName: 'ACTIVE', documentation: 'Abierta.' },
          { name: 'CLOSED', dbName: 'closed', documentation: null },
        ],
      }),
    ]);
    const status = model(docs, 'Congregation').columns.find(
      (c) => c.fieldName === 'status',
    );
    expect(status).toMatchObject({
      kind: 'enum',
      sqlType: "ENUM('ACTIVE', 'closed')",
      default: 'ACTIVE',
    });
  });

  it('builds one context per schema file with models, titled from the file header', () => {
    expect(parse().contexts).toEqual([
      {
        name: 'organization',
        file: 'organization.prisma',
        title: 'Organización',
        description:
          'Jerarquía multi-iglesia. Regla: toda tabla lleva denominationId.',
      },
    ]);
  });

  it('reports the file and line of a field it cannot read', () => {
    const parseBroken = () =>
      parseSchema([
        {
          name: 'broken.prisma',
          content: 'model A {\n  id Int @id\n  ???\n}\n',
        },
      ]);
    expect(parseBroken).toThrow(SchemaParseError);
    expect(parseBroken).toThrow('broken.prisma:3');
  });

  it('rejects unknown field types', () => {
    expect(() =>
      parseSchema([
        {
          name: 'a.prisma',
          content: 'model A {\n  id Int @id\n  x Missing\n}\n',
        },
      ]),
    ).toThrow('unknown type "Missing"');
  });
});

describe('helpers', () => {
  it('joins documentation lines with a space and drops empty ones', () => {
    expect(normalizeDocumentation([' Uno.', '', '  Dos  tres. '])).toBe(
      'Uno. Dos tres.',
    );
    expect(normalizeDocumentation(['', ' '])).toBeNull();
  });

  it('strips trailing comments outside strings', () => {
    expect(stripTrailingComment('url String @default("a//b") // note')).toEqual(
      {
        code: 'url String @default("a//b")',
        trailingDoc: null,
      },
    );
    expect(stripTrailingComment('id Int /// Doc.')).toEqual({
      code: 'id Int',
      trailingDoc: 'Doc.',
    });
  });

  it('maps Prisma and native types to MariaDB types', () => {
    expect(toSqlType('String', null)).toBe('VARCHAR(191)');
    expect(toSqlType('Int', null)).toBe('INTEGER');
    expect(toSqlType('Decimal', 'Decimal(14,2)')).toBe('DECIMAL(14, 2)');
    expect(toSqlType('String', 'Text')).toBe('TEXT');
    expect(toSqlType('DateTime', 'Date')).toBe('DATE');
    expect(toSqlType('Int', 'UnsignedInt')).toBe('INT UNSIGNED');
  });
});
