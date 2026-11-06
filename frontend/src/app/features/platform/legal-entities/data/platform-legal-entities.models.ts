// Legal entities (razones sociales) of every church, managed by the platform admin.
// Mirrors LegalEntity in backend/prisma/schema/organization.prisma plus the church that owns it.
import { LegalEntity } from '../../../../core/models/organization.model';

/** A legal entity as GET /platform/legal-entities returns it. */
export interface PlatformLegalEntityRow extends LegalEntity {
  readonly denominationName: string;
  readonly countryName: string;
  /** Sedes registered under this legal entity. */
  readonly congregationCount: number;
  readonly municipalityName?: string | null;
  readonly regionCode?: string | null;
  readonly regionName?: string | null;
  readonly createdAt?: string;
}

/** Fields the platform admin edits; the church is only chosen when the entity is created. */
export interface PlatformLegalEntityInput {
  readonly legalName: string;
  readonly tradeName: string | null;
  /** NIT with the check digit, e.g. 900.123.456-7. */
  readonly taxId: string;
  readonly legalRepresentative: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  /** Required on create; changing it is refused (409) while the legal entity has sedes. */
  readonly countryId: number;
  /** Official code of a municipality of `countryId`; `null` when the country has none loaded. */
  readonly municipalityCode: string | null;
}

export interface PlatformLegalEntityCreate extends PlatformLegalEntityInput {
  readonly denominationId: number;
}

/** A church listed in the filter and in the create form. */
export interface DenominationOption {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
}

/** Max lengths of the Prisma columns. */
export const LEGAL_ENTITY_LIMITS = {
  legalName: 200,
  taxId: 30,
  address: 200,
  phone: 30,
  email: 191,
} as const;

/** "Cartagena de Indias (Bolívar)", or an em dash while the municipality is unknown. */
export function municipalityLabel(row: Pick<PlatformLegalEntityRow, 'municipalityName' | 'regionName'>): string {
  if (!row.municipalityName) {
    return '—';
  }
  return row.regionName ? `${row.municipalityName} (${row.regionName})` : row.municipalityName;
}
