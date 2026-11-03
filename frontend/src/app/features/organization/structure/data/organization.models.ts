// Structure of one denomination (B-02/B-03), mirroring LegalEntity, District and Congregation
// in backend/prisma/schema/organization.prisma. Municipalities travel as DIVIPOLA codes.
import { Congregation, District, LegalEntity } from '../../../../core/models/organization.model';

export type OrganizationTab = 'sedes' | 'razones' | 'distritos';

export const ORGANIZATION_TABS: readonly {
  value: OrganizationTab;
  label: string;
  subtitle: string;
  icon: 'building' | 'landmark' | 'church';
}[] = [
  { value: 'sedes', label: 'Sedes', subtitle: 'Congregaciones y sus inscripciones', icon: 'building' },
  { value: 'razones', label: 'Razones sociales', subtitle: 'Entidades legales y NIT', icon: 'landmark' },
  { value: 'distritos', label: 'Distritos', subtitle: 'Agrupación de sedes', icon: 'church' },
];

export function isOrganizationTab(value: string | null | undefined): value is OrganizationTab {
  return ORGANIZATION_TABS.some((tab) => tab.value === value);
}

export interface OrganizationOverview {
  readonly denominationName: string;
  readonly activeCongregations: number;
  readonly totalCongregations: number;
  readonly acceptingApplications: number;
  readonly legalEntities: number;
  readonly districts: number;
}

/** A sede as the API returns it: municipality, department and neighborhood already resolved. */
export interface CongregationRow extends Congregation {
  /** Stable abbreviation (prefix of the member code). */
  readonly code: string;
  readonly legalEntityName: string;
  readonly districtNumber: string | null;
  readonly municipalityName: string | null;
  readonly regionName: string | null;
  readonly createdAt: string;
}

export interface LegalEntityRow extends LegalEntity {
  readonly municipalityName: string | null;
  readonly regionName: string | null;
  readonly createdAt: string;
}

/** "Cartagena de Indias (Bolívar)". */
export function placeLabel(place: {
  readonly municipalityName: string | null;
  readonly regionName: string | null;
}): string {
  if (!place.municipalityName) {
    return '—';
  }
  return place.regionName ? `${place.municipalityName} (${place.regionName})` : place.municipalityName;
}

export interface DistrictRow extends District {
  readonly congregationNames: readonly string[];
}

export interface CongregationInput {
  readonly name: string;
  /** Optional abbreviation; the API generates one from the name when it is left out. */
  readonly code?: string | null;
  readonly legalEntityId: number;
  readonly districtId: number | null;
  readonly municipalityCode: string;
  readonly neighborhood: string | null;
  readonly address: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly acceptsApplications: boolean;
}

export interface LegalEntityInput {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly legalRepresentative: string;
  readonly municipalityCode: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
}

export interface DistrictInput {
  readonly number: string;
  readonly name: string | null;
}

export interface SelectOption {
  readonly id: number;
  readonly label: string;
  readonly isActive: boolean;
}

/** Choices of the selects of the sede form, all of the tenant denomination. */
export interface CongregationFormOptions {
  readonly legalEntities: readonly SelectOption[];
  readonly districts: readonly SelectOption[];
}

/** Max lengths of the Prisma columns. */
export const FIELD_LIMITS = {
  congregationName: 150,
  congregationCode: 10,
  legalName: 200,
  taxId: 30,
  districtNumber: 20,
  districtName: 150,
  address: 200,
  phone: 30,
  email: 191,
  neighborhood: 120,
} as const;

/**
 * NIT: base digits (plain or grouped by thousands with dots) plus the check digit,
 * e.g. 900.123.456-7 or 900123456-7.
 */
export const TAX_ID_PATTERN = /^(?:\d{1,3}(?:\.\d{3}){1,3}|\d{5,12})-\d$/;

/** Digits of a NIT, used to compare NITs written with or without dots. */
export function taxIdDigits(taxId: string): string {
  return taxId.replace(/\D/g, '');
}

/** Canonical NIT: base grouped by thousands with dots, a hyphen and the check digit. */
export function formatTaxId(taxId: string): string {
  const [base = '', checkDigit = ''] = taxId.trim().split('-');
  const digits = base.replace(/\D/g, '');
  return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${checkDigit}`;
}

export function districtLabel(district: Pick<District, 'number' | 'name'>): string {
  return district.name ? `${district.number} · ${district.name}` : `Distrito ${district.number}`;
}
