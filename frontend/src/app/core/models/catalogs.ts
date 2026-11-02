// Global catalogs, mirroring the codes seeded by backend/prisma/seed.ts.

export interface CatalogEntry {
  readonly code: string;
  readonly name: string;
}

export const DOCUMENT_TYPES: readonly CatalogEntry[] = [
  { code: 'RC', name: 'Registro civil' },
  { code: 'TI', name: 'Tarjeta de identidad' },
  { code: 'CC', name: 'Cédula de ciudadanía' },
  { code: 'CE', name: 'Cédula de extranjería' },
  { code: 'PAS', name: 'Pasaporte' },
  { code: 'NUIP', name: 'NUIP' },
];

export const MARITAL_STATUSES: readonly CatalogEntry[] = [
  { code: 'SINGLE', name: 'Soltero(a)' },
  { code: 'MARRIED', name: 'Casado(a)' },
  { code: 'COMMON_LAW', name: 'Unión libre' },
  { code: 'SEPARATED', name: 'Separado(a)' },
  { code: 'DIVORCED', name: 'Divorciado(a)' },
  { code: 'WIDOWED', name: 'Viudo(a)' },
];

export const EDUCATION_LEVELS: readonly CatalogEntry[] = [
  { code: 'NONE', name: 'Ninguno' },
  { code: 'PRIMARY', name: 'Primaria' },
  { code: 'SECONDARY', name: 'Bachillerato' },
  { code: 'TECHNICAL', name: 'Técnico' },
  { code: 'TECHNOLOGIST', name: 'Tecnólogo' },
  { code: 'UNIVERSITY', name: 'Universitario' },
  { code: 'POSTGRADUATE', name: 'Posgrado' },
];

export const STUDY_TYPES: readonly CatalogEntry[] = [
  { code: 'COURSE', name: 'Cursos' },
  { code: 'TECHNICAL', name: 'Estudios técnicos' },
  { code: 'UNIVERSITY', name: 'Estudios universitarios' },
  { code: 'INITIAL', name: 'Estudios iniciales' },
  { code: 'THEOLOGICAL', name: 'Estudios teológicos' },
  { code: 'CHRISTIAN_EDUCATION', name: 'Educación cristiana' },
  { code: 'OTHER', name: 'Otros' },
];

export const MEETING_TYPES: readonly CatalogEntry[] = [
  { code: 'SUNDAY_SCHOOL', name: 'Escuela Dominical' },
];

export const ATTENDANCE_CATEGORIES: readonly CatalogEntry[] = [
  { code: 'CHILDREN', name: 'Niños' },
  { code: 'TEENAGERS', name: 'Adolescentes' },
  { code: 'WOMEN', name: 'Hermanas' },
  { code: 'MEN', name: 'Hermanos' },
  { code: 'VISITORS', name: 'Visitas' },
];

export function catalogName(catalog: readonly CatalogEntry[], code: string | null): string {
  return catalog.find((entry) => entry.code === code)?.name ?? '—';
}

/** Municipalities used by the demo data, with their DANE DIVIPOLA codes. */
export interface Municipality {
  readonly code: string;
  readonly name: string;
  readonly regionCode: string;
  readonly regionName: string;
}

export const DEMO_MUNICIPALITIES: readonly Municipality[] = [
  { code: '11001', name: 'Bogotá, D.C.', regionCode: '11', regionName: 'Bogotá, D.C.' },
  { code: '25754', name: 'Soacha', regionCode: '25', regionName: 'Cundinamarca' },
  { code: '25175', name: 'Chía', regionCode: '25', regionName: 'Cundinamarca' },
  { code: '25899', name: 'Zipaquirá', regionCode: '25', regionName: 'Cundinamarca' },
  { code: '05001', name: 'Medellín', regionCode: '05', regionName: 'Antioquia' },
  { code: '76001', name: 'Cali', regionCode: '76', regionName: 'Valle del Cauca' },
];

export function municipalityLabel(code: string | null): string {
  const municipality = DEMO_MUNICIPALITIES.find((item) => item.code === code);
  return municipality ? `${municipality.name} (${municipality.regionName})` : '—';
}
