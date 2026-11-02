// Structure of one denomination (B-02/B-03), mirroring LegalEntity, District and Congregation
// in backend/prisma/schema/organization.prisma. Municipalities travel as DIVIPOLA codes.
import { Congregation, District, LegalEntity } from '../../../../core/models/organization.model';

export type OrganizationTab = 'sedes' | 'razones' | 'distritos';

export const ORGANIZATION_TABS: readonly { value: OrganizationTab; label: string }[] = [
  { value: 'sedes', label: 'Sedes' },
  { value: 'razones', label: 'Razones sociales' },
  { value: 'distritos', label: 'Distritos' },
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

export interface CongregationRow extends Congregation {
  readonly legalEntityName: string;
  readonly districtNumber: string | null;
}

export type LegalEntityRow = LegalEntity;

export interface DistrictRow extends District {
  readonly congregationNames: readonly string[];
}

export interface CongregationInput {
  readonly name: string;
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
