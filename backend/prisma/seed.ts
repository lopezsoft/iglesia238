import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { parseMariaDbUrl } from '../src/infrastructure/prisma/mariadb-connection.js';

// Idempotent: global catalogs only. It never creates users or credentials.

interface CatalogEntry {
  code: string;
  name: string;
}

interface CountrySeed {
  isoAlpha2: string;
  isoAlpha3: string | null;
  name: string;
  phoneCode: string | null;
}

interface RegionSeed extends CatalogEntry {
  municipalities: CatalogEntry[];
}

interface DivisionsSeed {
  countryIsoAlpha2: string;
  regions: RegionSeed[];
}

// Generated data files; each one documents its origin in its "source" field.
function readSeedData<T>(fileName: string): T {
  const url = new URL(`./seed-data/${fileName}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as T;
}

const DOCUMENT_TYPES: CatalogEntry[] = [
  { code: 'RC', name: 'Registro civil' },
  { code: 'TI', name: 'Tarjeta de identidad' },
  { code: 'CC', name: 'Cédula de ciudadanía' },
  { code: 'CE', name: 'Cédula de extranjería' },
  { code: 'PAS', name: 'Pasaporte' },
  { code: 'NUIP', name: 'NUIP' },
  // Imported records without a known type: document type and number must always go together.
  { code: 'UNKNOWN', name: 'Sin tipo (importado)' },
];

const MARITAL_STATUSES: CatalogEntry[] = [
  { code: 'SINGLE', name: 'Soltero(a)' },
  { code: 'MARRIED', name: 'Casado(a)' },
  { code: 'COMMON_LAW', name: 'Unión libre' },
  { code: 'SEPARATED', name: 'Separado(a)' },
  { code: 'DIVORCED', name: 'Divorciado(a)' },
  { code: 'WIDOWED', name: 'Viudo(a)' },
];

const EDUCATION_LEVELS: CatalogEntry[] = [
  { code: 'NONE', name: 'Ninguno' },
  { code: 'PRIMARY', name: 'Primaria' },
  { code: 'SECONDARY', name: 'Bachillerato' },
  { code: 'TECHNICAL', name: 'Técnico' },
  { code: 'TECHNOLOGIST', name: 'Tecnólogo' },
  { code: 'UNIVERSITY', name: 'Universitario' },
  { code: 'POSTGRADUATE', name: 'Posgrado' },
];

const STUDY_TYPES: CatalogEntry[] = [
  { code: 'COURSE', name: 'Cursos' },
  { code: 'TECHNICAL', name: 'Estudios técnicos' },
  { code: 'UNIVERSITY', name: 'Estudios universitarios' },
  { code: 'INITIAL', name: 'Estudios iniciales' },
  { code: 'THEOLOGICAL', name: 'Estudios teológicos' },
  { code: 'CHRISTIAN_EDUCATION', name: 'Educación cristiana' },
  { code: 'OTHER', name: 'Otros' },
];

const MEETING_TYPES: CatalogEntry[] = [
  { code: 'SUNDAY_SCHOOL', name: 'Escuela Dominical' },
];

const ATTENDANCE_CATEGORIES: CatalogEntry[] = [
  { code: 'CHILDREN', name: 'Niños' },
  { code: 'TEENAGERS', name: 'Adolescentes' },
  { code: 'WOMEN', name: 'Hermanas' },
  { code: 'MEN', name: 'Hermanos' },
  { code: 'VISITORS', name: 'Visitas' },
];

const PERMISSIONS = [
  'denominations.manage',
  'congregations.manage',
  'users.manage',
  'applications.review',
  'members.read',
  'members.write',
  'socioeconomic-profiles.read',
  'socioeconomic-profiles.write',
  'certificates.issue',
  'attendance.write',
  'contributions.read',
  'contributions.write',
  'cash-transactions.write',
  'tithe-settlements.write',
  'budgets.manage',
  'reports.read',
  'audit-logs.read',
] as const;

type PermissionCode = (typeof PERMISSIONS)[number];

interface RoleSeed extends CatalogEntry {
  permissions: readonly PermissionCode[];
}

const ROLES: RoleSeed[] = [
  {
    code: 'PLATFORM_ADMIN',
    name: 'Administrador de plataforma',
    permissions: ['denominations.manage', 'users.manage', 'audit-logs.read'],
  },
  {
    code: 'DENOMINATION_ADMIN',
    name: 'Administrador de denominación',
    permissions: [
      'congregations.manage',
      'users.manage',
      'members.read',
      'reports.read',
      'audit-logs.read',
    ],
  },
  {
    code: 'PASTOR',
    name: 'Pastor',
    permissions: [
      'applications.review',
      'members.read',
      'members.write',
      'socioeconomic-profiles.read',
      'certificates.issue',
      'contributions.read',
      'reports.read',
    ],
  },
  {
    code: 'SECRETARY',
    name: 'Secretario(a)',
    permissions: [
      'applications.review',
      'members.read',
      'members.write',
      'socioeconomic-profiles.read',
      'socioeconomic-profiles.write',
      'certificates.issue',
      'attendance.write',
    ],
  },
  {
    code: 'TREASURER',
    name: 'Tesorero(a)',
    permissions: [
      'contributions.read',
      'contributions.write',
      'cash-transactions.write',
      'tithe-settlements.write',
      'budgets.manage',
      'reports.read',
    ],
  },
];

async function seedCatalog(
  entries: CatalogEntry[],
  upsert: (entry: CatalogEntry) => Promise<unknown>,
): Promise<void> {
  for (const entry of entries) {
    await upsert(entry);
  }
}

async function seedAccessControl(prisma: PrismaClient): Promise<void> {
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      create: { code },
      update: {},
    });
  }

  for (const { code, name, permissions } of ROLES) {
    const role = await prisma.role.upsert({
      where: { code },
      create: { code, name, isSystem: true },
      update: { name },
    });
    const granted = await prisma.permission.findMany({
      where: { code: { in: [...permissions] } },
    });
    const grantedIds = granted.map((permission) => permission.id);

    // The code is the source of truth: permissions removed from a role are revoked too.
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { notIn: grantedIds } },
      }),
      prisma.rolePermission.createMany({
        data: grantedIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      }),
    ]);
  }
}

async function seedCountries(prisma: PrismaClient): Promise<void> {
  const { countries } = readSeedData<{ countries: CountrySeed[] }>(
    'countries.json',
  );
  for (const { isoAlpha2, ...data } of countries) {
    await prisma.country.upsert({
      where: { isoAlpha2 },
      create: { isoAlpha2, ...data },
      update: data,
    });
  }
}

async function seedAdministrativeDivisions(
  prisma: PrismaClient,
  fileName: string,
): Promise<void> {
  const { countryIsoAlpha2, regions } = readSeedData<DivisionsSeed>(fileName);
  const country = await prisma.country.findUniqueOrThrow({
    where: { isoAlpha2: countryIsoAlpha2 },
  });

  for (const { code, name, municipalities } of regions) {
    const region = await prisma.region.upsert({
      where: { countryId_code: { countryId: country.id, code } },
      create: { countryId: country.id, code, name },
      update: { name },
    });
    const existing = await prisma.municipality.findMany({
      where: { regionId: region.id },
      select: { code: true, name: true },
    });
    const currentNames = new Map(existing.map((m) => [m.code, m.name]));

    // New municipalities go in one batch per region; existing ones are touched only if renamed.
    await prisma.municipality.createMany({
      data: municipalities
        .filter((m) => !currentNames.has(m.code))
        .map((m) => ({ regionId: region.id, ...m })),
    });
    const renamed = municipalities.filter(
      (m) => currentNames.has(m.code) && currentNames.get(m.code) !== m.name,
    );
    for (const m of renamed) {
      await prisma.municipality.update({
        where: { regionId_code: { regionId: region.id, code: m.code } },
        data: { name: m.name },
      });
    }
  }
}

async function seed(prisma: PrismaClient): Promise<void> {
  await seedCountries(prisma);
  await seedAdministrativeDivisions(prisma, 'colombia-divipola.json');

  const updateName = ({ code, name }: CatalogEntry) => ({
    where: { code },
    create: { code, name },
    update: { name },
  });

  await seedCatalog(DOCUMENT_TYPES, (entry) =>
    prisma.documentType.upsert(updateName(entry)),
  );
  await seedCatalog(MARITAL_STATUSES, (entry) =>
    prisma.maritalStatus.upsert(updateName(entry)),
  );
  await seedCatalog(EDUCATION_LEVELS, (entry) =>
    prisma.educationLevel.upsert(updateName(entry)),
  );
  await seedCatalog(STUDY_TYPES, (entry) =>
    prisma.studyType.upsert(updateName(entry)),
  );
  await seedCatalog(MEETING_TYPES, (entry) =>
    prisma.meetingType.upsert(updateName(entry)),
  );
  await seedCatalog(ATTENDANCE_CATEGORIES, (entry) =>
    prisma.attendanceCategory.upsert(updateName(entry)),
  );
  await seedAccessControl(prisma);
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed the database');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaMariaDb(parseMariaDbUrl(databaseUrl)),
  });
  try {
    await seed(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Seed failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
