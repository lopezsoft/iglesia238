// Denominations seen by the platform admin, mirroring Denomination in
// backend/prisma/schema/organization.prisma. Only structural counts are exposed: the platform
// admin never sees members, applications or finances of a denomination.

export interface DenominationSummary {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly legalEntityCount: number;
  readonly congregationCount: number;
}

export interface DenominationStats {
  readonly total: number;
  readonly active: number;
  readonly congregations: number;
}

export type DenominationStatusFilter = 'all' | 'active' | 'inactive';

export interface DenominationQuery {
  readonly search: string;
  readonly status: DenominationStatusFilter;
  readonly page: number;
  readonly pageSize: number;
}

export interface DenominationInput {
  readonly name: string;
}

export const DENOMINATION_NAME_MAX_LENGTH = 200;

export const DENOMINATION_STATUS_OPTIONS: readonly {
  value: DenominationStatusFilter;
  label: string;
}[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activa' },
  { value: 'inactive', label: 'Inactiva' },
];

/** What the API creates with every denomination (shown in the create drawer). */
export const DENOMINATION_TEMPLATE_ITEMS: readonly string[] = [
  'Fondo «Fondo Local»',
  'Plan de cuentas inicial',
  'Tipos de aporte: diezmo, ofrenda, primicia y voto',
  'Certificados: membresía, traslado, bautismo y asistencia',
  'Grados pastorales y cargos básicos',
  'Política de datos en borrador',
];

/** `page` limited to the pages that `total` rows fill (at least 1). */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / pageSize)));
}

/** Two initials for the avatar, skipping Spanish connectors (de, la…). */
export function denominationInitials(name: string): string {
  const connectors = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y']);
  const words = name
    .split(/\s+/)
    .filter((word) => word !== '' && !connectors.has(word.toLowerCase()));
  const first = words.length > 1 ? words[words.length - 2] : (words[0] ?? '');
  const last = words.length > 0 ? words[words.length - 1] : '';
  return `${first.charAt(0)}${words.length > 1 ? last.charAt(0) : ''}`.toUpperCase();
}
