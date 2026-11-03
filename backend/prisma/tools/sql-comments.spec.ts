import { parseSchema } from './schema-docs.js';
import type { SchemaDocs } from './schema-docs.js';
import {
  COLUMN_COMMENT_MAX_LENGTH,
  CommentInjectionError,
  escapeSqlString,
  extractCheckConstraints,
  injectComments,
  maskSql,
} from './sql-comments.js';

const SCHEMA = `
/// Movimiento del libro de caja: entrada o salida de dinero.
model CashTransaction {
  /// Identificador interno.
  id          Int           @id @default(autoincrement())
  /// Sentido del dinero.
  direction   CashDirection
  /// Valor del movimiento, siempre positivo.
  amount      Decimal       @db.Decimal(14, 2)
  /// Detalle libre: "O'Brien" pagó en C:\\caja.
  description String        @db.VarChar(255)
  /// Momento del registro.
  createdAt   DateTime      @default(now()) @map("created_at")
  /// Última modificación.
  updatedAt   DateTime      @updatedAt @map("updated_at")

  @@map("cash_transactions")
}

/// Sede.
model Congregation {
  /// Identificador interno.
  id   Int    @id @default(autoincrement())
  /// Abreviatura estable de la sede.
  code String @db.VarChar(10)
  name String @db.VarChar(150)

  @@map("congregations")
}

model District {
  id Int @id

  @@map("districts")
}

enum CashDirection {
  IN
  OUT
}
`;

function docs(): SchemaDocs {
  return parseSchema([{ name: 'accounting.prisma', content: SCHEMA }]);
}

const CREATE_CASH = `-- CreateTable
CREATE TABLE \`cash_transactions\` (
    \`id\` INTEGER NOT NULL AUTO_INCREMENT,
    \`direction\` ENUM('IN', 'OUT') NOT NULL,
    \`amount\` DECIMAL(14, 2) NOT NULL,
    \`description\` VARCHAR(255) NOT NULL DEFAULT 'a, b (c) COMMENT',
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX \`cash_transactions_created_at_idx\`(\`created_at\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`;

describe('injectComments', () => {
  it('comments every column and the table of a multi-line CREATE TABLE', () => {
    const result = injectComments(CREATE_CASH, docs());
    expect(result.sql).toBe(`-- CreateTable
CREATE TABLE \`cash_transactions\` (
    \`id\` INTEGER NOT NULL AUTO_INCREMENT COMMENT 'Identificador interno.',
    \`direction\` ENUM('IN', 'OUT') NOT NULL COMMENT 'Sentido del dinero.',
    \`amount\` DECIMAL(14, 2) NOT NULL COMMENT 'Valor del movimiento, siempre positivo.',
    \`description\` VARCHAR(255) NOT NULL DEFAULT 'a, b (c) COMMENT' COMMENT 'Detalle libre: "O''Brien" pagó en C:\\\\caja.',
    \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'Momento del registro.',
    \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT 'Última modificación.',

    INDEX \`cash_transactions_created_at_idx\`(\`created_at\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT='Movimiento del libro de caja: entrada o salida de dinero.';
`);
    expect(result.added).toHaveLength(7);
    expect(result.added.at(-1)).toEqual({
      table: 'cash_transactions',
      column: null,
      line: 2,
    });
    expect(result.alreadyCommented).toBe(0);
  });

  it('is idempotent: a second run changes nothing', () => {
    const first = injectComments(CREATE_CASH, docs());
    const second = injectComments(first.sql, docs());
    expect(second.sql).toBe(first.sql);
    expect(second.added).toEqual([]);
    expect(second.alreadyCommented).toBe(7);
  });

  it('keeps an existing COMMENT and does not ask for documentation it no longer needs', () => {
    const sql = `CREATE TABLE \`congregations\` (
    \`id\` INTEGER NOT NULL AUTO_INCREMENT,
    \`code\` VARCHAR(10) NOT NULL,
    \`name\` VARCHAR(150) NOT NULL COMMENT 'Nombre visible.',
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COMMENT 'Sede o congregación.';`;
    const result = injectComments(sql, docs());
    expect(result.sql).toContain(
      "`name` VARCHAR(150) NOT NULL COMMENT 'Nombre visible.',",
    );
    expect(result.sql).toContain("COMMENT 'Sede o congregación.';");
    expect(result.sql.match(/COMMENT/g)).toHaveLength(4);
    expect(result.alreadyCommented).toBe(2);
  });

  it('comments ALTER TABLE ... ADD COLUMN and MODIFY, and ignores keys and constraints', () => {
    const sql = `ALTER TABLE \`congregations\` ADD COLUMN \`code\` VARCHAR(10) NULL;
UPDATE \`congregations\` SET \`code\` = CONCAT('S', \`id\`) WHERE \`code\` IS NULL;
ALTER TABLE \`congregations\`
    -- the code is now required
    MODIFY \`code\` VARCHAR(10) NOT NULL,
    ADD CONSTRAINT \`congregations_code_fkey\` FOREIGN KEY (\`id\`) REFERENCES \`districts\`(\`id\`),
    ADD UNIQUE INDEX \`congregations_code_key\`(\`code\`);
ALTER TABLE \`cash_transactions\` ADD \`amount\` DECIMAL(14, 2) NOT NULL AFTER \`direction\`;
CREATE INDEX \`idx\` ON \`congregations\`(\`code\`);`;
    const result = injectComments(sql, docs());
    expect(result.sql)
      .toBe(`ALTER TABLE \`congregations\` ADD COLUMN \`code\` VARCHAR(10) NULL COMMENT 'Abreviatura estable de la sede.';
UPDATE \`congregations\` SET \`code\` = CONCAT('S', \`id\`) WHERE \`code\` IS NULL;
ALTER TABLE \`congregations\`
    -- the code is now required
    MODIFY \`code\` VARCHAR(10) NOT NULL COMMENT 'Abreviatura estable de la sede.',
    ADD CONSTRAINT \`congregations_code_fkey\` FOREIGN KEY (\`id\`) REFERENCES \`districts\`(\`id\`),
    ADD UNIQUE INDEX \`congregations_code_key\`(\`code\`);
ALTER TABLE \`cash_transactions\` ADD \`amount\` DECIMAL(14, 2) NOT NULL COMMENT 'Valor del movimiento, siempre positivo.' AFTER \`direction\`;
CREATE INDEX \`idx\` ON \`congregations\`(\`code\`);`);
    expect(result.added.map((a) => `${a.table}.${a.column}`)).toEqual([
      'congregations.code',
      'congregations.code',
      'cash_transactions.amount',
    ]);
  });

  it('comments the new name of CHANGE COLUMN', () => {
    const sql =
      'ALTER TABLE `congregations` CHANGE COLUMN `abbr` `code` VARCHAR(10) NOT NULL;';
    expect(injectComments(sql, docs()).sql).toBe(
      "ALTER TABLE `congregations` CHANGE COLUMN `abbr` `code` VARCHAR(10) NOT NULL COMMENT 'Abreviatura estable de la sede.';",
    );
  });

  it('fails with the full list of missing documentation and changes nothing', () => {
    const sql = `CREATE TABLE \`districts\` (
    \`id\` INTEGER NOT NULL,
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4;
ALTER TABLE \`congregations\` ADD COLUMN \`name\` VARCHAR(150) NOT NULL, ADD COLUMN \`ghost\` INTEGER NULL;
CREATE TABLE \`unknown_table\` (\`id\` INTEGER NOT NULL);`;
    let error: unknown;
    try {
      injectComments(sql, docs());
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CommentInjectionError);
    expect((error as CommentInjectionError).problems).toEqual([
      'línea 2: la columna `districts`.`id` (District.id) no tiene documentación ///.',
      'línea 1: la tabla `districts` (modelo District) no tiene documentación ///.',
      'línea 5: la columna `congregations`.`name` (Congregation.name) no tiene documentación ///.',
      'línea 5: la columna `congregations`.`ghost` no existe en el modelo Congregation.',
      'línea 6: la tabla `unknown_table` no corresponde a ningún modelo del esquema Prisma.',
    ]);
  });

  it('enforces the MariaDB comment length limit', () => {
    const long = 'x'.repeat(COLUMN_COMMENT_MAX_LENGTH + 1);
    const schema = parseSchema([
      {
        name: 'a.prisma',
        content: `/// T.\nmodel A {\n  /// ${long}\n  id Int @id\n\n  @@map("a")\n}\n`,
      },
    ]);
    expect(() =>
      injectComments('ALTER TABLE `a` MODIFY `id` INTEGER NOT NULL;', schema),
    ).toThrow(
      `la documentación tiene ${COLUMN_COMMENT_MAX_LENGTH + 1} caracteres y MariaDB admite ${COLUMN_COMMENT_MAX_LENGTH}`,
    );
  });

  it('leaves statements without columns untouched', () => {
    const sql =
      "-- nothing to document\nUPDATE `congregations` SET `name` = 'a;b';\nDROP INDEX `x` ON `districts`;\n";
    const result = injectComments(sql, docs());
    expect(result.sql).toBe(sql);
    expect(result.added).toEqual([]);
  });
});

describe('SQL helpers', () => {
  it('escapes quotes by doubling them and backslashes', () => {
    expect(escapeSqlString("O'Brien \\ C:\\x")).toBe("O''Brien \\\\ C:\\\\x");
  });

  it('masks strings, quoted identifiers and comments without changing the length', () => {
    const sql = "SELECT 'a;b', `c,d` -- e;f\n/* g */ 1;";
    const masked = maskSql(sql);
    expect(masked).toHaveLength(sql.length);
    // "-- e;f" and "/* g */" become blanks of the same width.
    expect(masked).toBe(
      "SELECT '___', `___` " + ' '.repeat(6) + '\n' + ' '.repeat(7) + ' 1;',
    );
  });

  it('extracts CHECK constraints with the comment above them', () => {
    const sql = `-- Header of the file.

ALTER TABLE \`contributions\`
  ADD CONSTRAINT \`chk_amount\` CHECK (\`amount\` > 0),
  -- A vow always belongs to a person.
  ADD CONSTRAINT \`chk_vow\` CHECK (\`vow_id\` IS NULL OR \`person_id\` IS NOT NULL);

-- Fixed order, so the same couple cannot be stored twice.
ALTER TABLE \`marriages\`
  ADD CONSTRAINT \`chk_spouses\` CHECK (\`spouse1_id\` < \`spouse2_id\`);`;
    expect(extractCheckConstraints(sql)).toEqual([
      {
        table: 'contributions',
        name: 'chk_amount',
        expression: '`amount` > 0',
        description: null,
      },
      {
        table: 'contributions',
        name: 'chk_vow',
        expression: '`vow_id` IS NULL OR `person_id` IS NOT NULL',
        description: 'A vow always belongs to a person.',
      },
      {
        table: 'marriages',
        name: 'chk_spouses',
        expression: '`spouse1_id` < `spouse2_id`',
        description: 'Fixed order, so the same couple cannot be stored twice.',
      },
    ]);
  });
});
